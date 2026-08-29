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

import { StatisticsQueryDto } from "./statistics.controller";
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
});

describe("StatisticsService filters", () => {
  it("builds the shared event, casual, date, round and ending filters", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new StatisticsService({ game: { findMany } } as never);

    await service.cards({
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
      service.cards({
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
    const service = new StatisticsService({ game: { findMany } } as never);

    const result = await service.cards(defaults());

    expect(result.characters.find((item) => item.id === "1")?.wins).toBe(0);
    expect(result.characters.find((item) => item.id === "4")?.wins).toBe(1);
  });
});
