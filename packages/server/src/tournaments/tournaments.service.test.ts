// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";

vi.mock("#prisma/client", () => ({ Prisma: {} }));
vi.mock("@gi-tcg/core", () => ({
  CORE_VERSION: "test-core-version",
  CURRENT_VERSION: "test-game-version",
}));
vi.mock("../db/prisma.service", () => ({ PrismaService: class {} }));
vi.mock("../decks/decks.service", () => ({ characterKey: vi.fn() }));
vi.mock("../rooms/room-runtime", () => ({
  isPlayerInRunningRoom: vi.fn(),
}));
vi.mock("../utils", () => ({
  ASSETS_MANAGER: { decode: vi.fn() },
  MATCH_CONFIG_VERSION: "",
}));

import { TournamentsService } from "./tournaments.service";

const transactionClient = (overrides: Record<string, unknown> = {}) => ({
  $executeRaw: vi.fn(),
  auditLog: { create: vi.fn() },
  ...overrides,
});

describe("TournamentsService running match administration", () => {
  it("disables automatic game creation for bye matches", async () => {
    const createMatch = vi
      .fn()
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 8 });
    const createdEvent = {
      id: 3,
      name: "Test event",
      phase: "DECK_COLLECTION",
      deckLimit: 0,
    };
    const result = { ...createdEvent, matches: [] };
    const tx = transactionClient({
      user: {
        findMany: vi.fn().mockResolvedValue(
          [101, 102, 201].map((id) => ({
            id,
            competitionStatus: "PLAYER",
            activeMatchId: null,
          })),
        ),
        update: vi.fn(),
      },
      tournamentEvent: {
        create: vi.fn().mockResolvedValue(createdEvent),
        findUniqueOrThrow: vi.fn().mockResolvedValue(result),
      },
      tournamentMatch: { create: createMatch },
    });
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(tx)),
    };
    const service = new TournamentsService(prisma as never);

    await expect(
      service.createEvent(11, {
        event: {
          name: "Test event",
          initialPhase: "DECK_COLLECTION",
          deckLimit: 0,
        },
        matchTemplate: {
          mode: "UNRESTRICTED",
          maxGames: 3,
          winsRequired: 2,
          autoCreateGame: true,
          roomConfig: {},
        },
        player0Ids: [101, 102],
        player1Ids: [201],
      }),
    ).resolves.toBe(result);

    expect(createMatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ autoCreateGame: true }),
      }),
    );
    expect(createMatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          autoCreateGame: false,
          participants: { create: [{ userId: 102, who: 0 }] },
        }),
      }),
    );
  });

  it("updates match configuration while running and audits before and after", async () => {
    const before = {
      id: 7,
      eventId: 3,
      event: { id: 3, phase: "RUNNING" },
      mode: "DUEL",
      maxGames: 3,
      winsRequired: 2,
      roomConfig: {},
    };
    const after = {
      ...before,
      mode: "CONQUEST",
      maxGames: 5,
      winsRequired: 3,
      roomConfig: { watchable: false },
    };
    const tx = transactionClient({
      tournamentMatch: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(before),
        update: vi.fn().mockResolvedValue(after),
      },
    });
    const prisma = {
      tournamentMatch: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ eventId: 3 }),
      },
      $transaction: vi.fn(async (operation) => operation(tx)),
    };
    const service = new TournamentsService(prisma as never);

    await expect(
      service.patchMatch(11, 7, {
        mode: "CONQUEST",
        maxGames: 5,
        winsRequired: 3,
        roomConfig: { watchable: false },
      }),
    ).resolves.toBe(after);

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 11,
        action: "MATCH_UPDATE",
        targetType: "TournamentMatch",
        targetId: "7",
        before,
        after,
      }),
    });
  });

  it("manually creates a game while running and audits it", async () => {
    const game = {
      id: 19,
      matchId: 7,
      players: [
        { who: 0, userId: 101 },
        { who: 1, userId: 102 },
      ],
    };
    const tx = transactionClient({
      tournamentMatch: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 7,
          event: { phase: "RUNNING" },
          participants: [
            { who: 0, userId: 101 },
            { who: 1, userId: 102 },
          ],
          games: [],
          winnerUserId: null,
          maxGames: 3,
          autoCreateGame: false,
        }),
      },
      game: { create: vi.fn().mockResolvedValue(game) },
    });
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(tx)),
    };
    const service = new TournamentsService(prisma as never);

    await expect(service.createGame(11, 7)).resolves.toBe(game);

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 11,
        action: "GAME_CREATE",
        targetType: "TournamentMatch",
        targetId: "7",
        after: game,
      }),
    });
  });

  it("unassigns a participant deck and records the administrative reason", async () => {
    const current = {
      id: 31,
      matchId: 7,
      userId: 101,
      sourceDeckId: 23,
      name: "Test deck",
    };
    const deleteMatchDeck = vi.fn().mockResolvedValue(current);
    const tx = transactionClient({
      tournamentMatch: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 7,
          event: { phase: "RUNNING" },
        }),
      },
      matchParticipant: {
        findUnique: vi.fn().mockResolvedValue({ matchId: 7, userId: 101 }),
      },
      matchDeck: {
        findFirst: vi.fn().mockResolvedValue(current),
        delete: deleteMatchDeck,
      },
    });
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(tx)),
    };
    const service = new TournamentsService(prisma as never);

    await expect(
      service.unassignDeck(11, 7, 101, 23, "Incorrect assignment"),
    ).resolves.toBe(current);

    expect(deleteMatchDeck).toHaveBeenCalledWith({ where: { id: 31 } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 11,
        action: "MATCH_DECK_UNASSIGN",
        targetType: "MatchDeck",
        targetId: "31",
        reason: "Incorrect assignment",
        before: current,
      }),
    });
  });
});
