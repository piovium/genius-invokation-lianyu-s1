// Copyright (C) 2026 Piovium Labs
// SPDX-License-Identifier: AGPL-3.0-or-later

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db/prisma.service", () => ({ PrismaService: class {} }));
vi.mock("../auth/admin.guard", () => ({ AdminGuard: class {} }));
vi.mock("../decks/decks.service", () => ({
  characterKey: (characters: number[]) => [...characters].sort().join(":"),
}));

import {
  StatisticsQueryDto,
  StatisticsRecordsQueryDto,
} from "./statistics.controller";
import {
  type StatisticsFilters,
  StatisticsService,
} from "./statistics.service";

const defaults = (): StatisticsFilters => ({
  sources: ["tournament", "casual"],
  includeSurrender: true,
  includeAdmin: true,
});

describe("StatisticsQueryDto", () => {
  it("applies unrestricted defaults", async () => {
    const dto = plainToInstance(StatisticsQueryDto, {});

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject(defaults());
    expect(dto.roundCounts).toBeUndefined();
  });

  it("parses CSV filters", async () => {
    const dto = plainToInstance(StatisticsQueryDto, {
      sources: "casual,tournament",
      eventIds: "3,5",
      roundCounts: "2,7,14",
      includeSurrender: "false",
      includeAdmin: "true",
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.sources).toEqual(["casual", "tournament"]);
    expect(dto.eventIds).toEqual([3, 5]);
    expect(dto.roundCounts).toEqual([2, 7, 14]);
    expect(dto.includeSurrender).toBe(false);
    expect(dto.includeAdmin).toBe(true);
  });

  it("rejects invalid rounds and dates", async () => {
    const dto = plainToInstance(StatisticsQueryDto, {
      createdAtFrom: "2026/08/01",
      roundCounts: "0,15",
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("allows record pagination to start at zero", async () => {
    const firstPage = plainToInstance(StatisticsRecordsQueryDto, { skip: "0" });
    const invalid = plainToInstance(StatisticsRecordsQueryDto, { skip: "-1" });

    expect(await validate(firstPage)).toHaveLength(0);
    expect(firstPage.skip).toBe(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});

describe("StatisticsService filters", () => {
  it("builds the shared event, casual, date, round and ending filters", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new StatisticsService({
      game: { findMany },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    await service.overview({
      ...defaults(),
      createdAtFrom: "2026-08-01",
      createdAtTo: "2026-08-29",
      eventIds: [3, 5],
      roundCounts: [2, 7],
      includeSurrender: false,
    });

    expect(findMany.mock.calls[0]![0].where).toEqual({
      status: "FINISHED",
      countForStats: true,
      createdAt: {
        gte: new Date("2026-08-01T00:00:00.000Z"),
        lt: new Date("2026-08-30T00:00:00.000Z"),
      },
      AND: [
        {
          OR: [{ matchId: null }, { match: { eventId: { in: [3, 5] } } }],
        },
        {
          OR: [
            { endReason: "NORMAL", roundCount: { in: [2, 7] } },
            { endReason: "ADMIN" },
          ],
        },
      ],
    });
  });

  it("rejects reversed date ranges before querying", async () => {
    const findMany = vi.fn();
    const service = new StatisticsService({ game: { findMany } } as never);

    await expect(
      service.overview({
        ...defaults(),
        createdAtFrom: "2026-08-30",
        createdAtTo: "2026-08-29",
      }),
    ).rejects.toThrow("createdAtFrom must not be after createdAtTo");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("uses the manual winner only for admin-ended games", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        winnerWho: 0,
        manualWinnerWho: 1,
        endReason: "ADMIN",
        createdAt: new Date(),
        players: [
          {
            who: 0,
            userId: null,
            deckJson: { characters: [1, 2, 3], cards: [10] },
            characterKey: "1:2:3",
          },
          {
            who: 1,
            userId: null,
            deckJson: { characters: [4, 5, 6], cards: [20] },
            characterKey: "4:5:6",
          },
        ],
      },
    ]);
    const service = new StatisticsService({
      game: { findMany },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    const result = await service.overview(defaults());

    expect(result.characters.find((item) => item.id === "1")?.wins).toBe(0);
    expect(result.characters.find((item) => item.id === "4")?.wins).toBe(1);
  });

  it("calculates average and net action card copies", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        winnerWho: 0,
        manualWinnerWho: null,
        endReason: "NORMAL",
        players: [
          {
            who: 0,
            userId: null,
            deckJson: { characters: [1, 2, 3], cards: [10, 10, 20] },
            characterKey: "1:2:3",
          },
          {
            who: 1,
            userId: null,
            deckJson: { characters: [4, 5, 6], cards: [10, 30] },
            characterKey: "4:5:6",
          },
        ],
      },
    ]);
    const service = new StatisticsService({
      game: { findMany },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    const result = await service.overview(defaults());
    const card = result.actionCards.find((item) => item.id === "10");

    expect(card).toMatchObject({
      appearances: 2,
      averageCopies: 1.5,
      netCopies: 1.5,
    });
  });

  it("returns user totals without deck details", async () => {
    const gameFindMany = vi.fn().mockResolvedValue([
      {
        winnerWho: 0,
        manualWinnerWho: null,
        endReason: "NORMAL",
        players: [
          {
            who: 0,
            userId: 7,
            deckJson: { characters: [1, 2, 3], cards: [10] },
            characterKey: "1:2:3",
          },
          {
            who: 1,
            userId: null,
            deckJson: { characters: [4, 5, 6], cards: [20] },
            characterKey: "4:5:6",
          },
        ],
      },
    ]);
    const userFindMany = vi
      .fn()
      .mockResolvedValue([{ id: 7, qq: "10007", name: "User 7" }]);
    const service = new StatisticsService({
      game: { findMany: gameFindMany },
      user: { findMany: userFindMany },
    } as never);

    const result = await service.overview(defaults());

    expect(result.users).toEqual([
      {
        id: 7,
        qq: "10007",
        name: "User 7",
        games: 1,
        wins: 1,
        netWins: 1,
        winRate: 1,
      },
    ]);
    expect(result.users[0]).not.toHaveProperty("decks");
  });

  it("builds combination trends, matchups, positions and action cards", async () => {
    const player = (who: number, characters: number[], cards: number[]) => ({
      who,
      userId: null,
      deckJson: { characters, cards },
      characterKey: [...characters].sort((a, b) => a - b).join(":"),
    });
    const findMany = vi.fn().mockResolvedValue([
      {
        winnerWho: 0,
        manualWinnerWho: null,
        endReason: "NORMAL",
        createdAt: new Date("2026-08-10T12:00:00.000Z"),
        players: [
          player(0, [1, 2, 3], [10, 10, 20]),
          player(1, [4, 5, 6], [40]),
        ],
      },
      {
        winnerWho: 0,
        manualWinnerWho: null,
        endReason: "NORMAL",
        createdAt: new Date("2026-08-09T12:00:00.000Z"),
        players: [player(0, [7, 8, 9], [50]), player(1, [3, 2, 1], [10, 30])],
      },
      {
        winnerWho: 1,
        manualWinnerWho: null,
        endReason: "NORMAL",
        createdAt: new Date("2026-08-05T12:00:00.000Z"),
        players: [player(0, [1, 3, 2], [20]), player(1, [2, 1, 3], [20, 20])],
      },
      {
        winnerWho: 0,
        manualWinnerWho: null,
        endReason: "NORMAL",
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
        players: [player(0, [4, 5, 6], [40]), player(1, [7, 8, 9], [50])],
      },
    ]);
    const service = new StatisticsService({ game: { findMany } } as never);

    const result = await service.combination("3:1:2", {
      ...defaults(),
      createdAtTo: "2026-08-10",
    });

    expect(result.characterKey).toBe("1:2:3");
    expect(result.overview).toMatchObject({
      appearances: 4,
      appearanceRate: 0.5,
      wins: 2,
      winRate: 0.5,
      awayAppearances: 2,
      awayWinRate: 0.5,
    });
    expect(result.trend).toEqual([
      expect.objectContaining({
        key: "last1Day",
        gameCount: 1,
        appearances: 1,
        appearanceRate: 0.5,
        winRate: 1,
        awayWinRate: 1,
      }),
      expect.objectContaining({
        key: "last3Days",
        gameCount: 1,
        appearances: 1,
        appearanceRate: 0.5,
        winRate: 0,
        awayWinRate: 0,
      }),
      expect.objectContaining({
        key: "last7Days",
        gameCount: 1,
        appearances: 2,
        appearanceRate: 1,
        winRate: 0.5,
        awayWinRate: null,
      }),
      expect.objectContaining({
        key: "earlier",
        gameCount: 1,
        appearances: 0,
        appearanceRate: 0,
        winRate: null,
        awayWinRate: null,
      }),
    ]);
    expect(result.matchups.advantages).toEqual([
      expect.objectContaining({ id: "4:5:6", appearances: 1, winRate: 1 }),
    ]);
    expect(result.matchups.disadvantages).toEqual([
      expect.objectContaining({ id: "7:8:9", appearances: 1, winRate: 0 }),
    ]);
    expect(result.positions).toHaveLength(4);
    expect(result.positions[0]).toMatchObject({
      appearances: 1,
      appearanceRate: 0.25,
    });
    expect(result.actionCards[0]).toMatchObject({
      id: "20",
      appearances: 3,
      averageCopies: 1,
      netCopies: 4 / 3,
      winRate: 2 / 3,
      mirrorWinRate: 0.5,
      awayWinRate: 1,
    });
    expect(result.actionCards[1]).toMatchObject({
      id: "10",
      appearances: 2,
      averageCopies: 0.75,
      netCopies: 1.5,
      winRate: 0.5,
      mirrorWinRate: null,
      awayWinRate: 0.5,
    });
  });

  it("returns all combination matchups and action cards", async () => {
    const actionCards = Array.from({ length: 45 }, (_, index) => 1000 + index);
    const games = Array.from({ length: 12 }, (_, index) => ({
      winnerWho: 0,
      manualWinnerWho: null,
      endReason: "NORMAL",
      createdAt: new Date(),
      players: [
        {
          who: 0,
          userId: null,
          deckJson: { characters: [1, 2, 3], cards: actionCards },
          characterKey: "1:2:3",
        },
        {
          who: 1,
          userId: null,
          deckJson: {
            characters: [100 + index * 3, 101 + index * 3, 102 + index * 3],
            cards: [2000],
          },
          characterKey: `${100 + index * 3}:${101 + index * 3}:${102 + index * 3}`,
        },
      ],
    }));
    const service = new StatisticsService({
      game: { findMany: vi.fn().mockResolvedValue(games) },
    } as never);

    const result = await service.combination("1:2:3", defaults());

    expect(result.matchups.advantages).toHaveLength(12);
    expect(result.actionCards).toHaveLength(45);
  });

  it("compares a user's combinations with the filtered overview", async () => {
    const player = (
      who: number,
      userId: number | null,
      characters: number[],
    ) => ({
      who,
      userId,
      deckJson: { characters, cards: [10] },
      characterKey: [...characters].sort((a, b) => a - b).join(":"),
    });
    const gameFindMany = vi.fn().mockResolvedValue([
      {
        winnerWho: 0,
        manualWinnerWho: null,
        endReason: "NORMAL",
        createdAt: new Date(),
        players: [player(0, 7, [1, 2, 3]), player(1, null, [4, 5, 6])],
      },
      {
        winnerWho: 1,
        manualWinnerWho: null,
        endReason: "NORMAL",
        createdAt: new Date(),
        players: [player(0, 7, [1, 2, 3]), player(1, null, [4, 5, 6])],
      },
      {
        winnerWho: 0,
        manualWinnerWho: null,
        endReason: "NORMAL",
        createdAt: new Date(),
        players: [player(0, null, [1, 2, 3]), player(1, null, [7, 8, 9])],
      },
    ]);
    const service = new StatisticsService({
      game: { findMany: gameFindMany },
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 7, qq: "10007", name: "User 7" }),
      },
    } as never);

    const result = await service.user(7, defaults());

    expect(result.overview).toEqual({
      games: 2,
      wins: 1,
      netWins: 0,
      winRate: 0.5,
    });
    expect(result.combinations).toEqual([
      {
        id: "1:2:3",
        appearances: 2,
        wins: 1,
        winRate: 0.5,
        overviewWinRate: 2 / 3,
      },
    ]);
  });

  it("returns filtered user records in fixed pages without state logs", async () => {
    const games = Array.from({ length: 21 }, (_, index) => {
      const id = 21 - index;
      return {
        id,
        matchId: null,
        winnerWho: 0,
        manualWinnerWho: id === 1 ? 1 : null,
        endReason: id === 1 ? "ADMIN" : "NORMAL",
        roundCount: 5,
        createdAt: new Date(`2026-08-${String(id).padStart(2, "0")}T12:00:00Z`),
        finishedAt: null,
        players: [
          {
            who: 0,
            userId: 7,
            deckName: "User 7",
            deckJson: { characters: [1, 2, 3], cards: [10] },
            characterKey: "1:2:3",
            user: { id: 7, name: "User 7", qq: "10007" },
          },
          {
            who: 1,
            userId: null,
            deckName: "Guest",
            deckJson: { characters: [4, 5, 6], cards: [20] },
            characterKey: "4:5:6",
            user: null,
          },
        ],
      };
    });
    const findMany = vi.fn().mockResolvedValue(games);
    const service = new StatisticsService({ game: { findMany } } as never);

    const result = await service.userGames(7, defaults(), 20);

    expect(result).toMatchObject({ count: 21, skip: 20, take: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 1,
      effectiveWinnerWho: 1,
      targetWhos: [0],
      players: [
        expect.objectContaining({ characterKey: "1:2:3" }),
        expect.objectContaining({
          displayName: "Guest",
          characterKey: "4:5:6",
        }),
      ],
    });
    expect(findMany.mock.calls[0]![0].orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    expect(findMany.mock.calls[0]![0].select).not.toHaveProperty("stateLog");
  });
});
