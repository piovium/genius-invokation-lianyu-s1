// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";

vi.mock("../rooms/rooms.service", () => ({ RoomsService: class {} }));
vi.mock("./tournaments.service", () => ({ TournamentsService: class {} }));

import { TournamentRoomRecoveryService } from "./tournament-room-recovery.service";

describe("TournamentRoomRecoveryService", () => {
  it("reserves a room for every pending tournament game on startup", async () => {
    const reservations = [
      {
        gameId: 11,
        expectedUserIds: [1, 2] as const,
        expectedPlayers: [
          { isGuest: false as const, id: 1, name: "A" },
          { isGuest: false as const, id: 2, name: "B" },
        ] as const,
        roomConfig: { watchable: false },
      },
      {
        gameId: 12,
        expectedUserIds: [3, 4] as const,
        expectedPlayers: [
          { isGuest: false as const, id: 3, name: "C" },
          { isGuest: false as const, id: 4, name: "D" },
        ] as const,
        roomConfig: { watchable: true },
      },
    ];
    const tournaments = {
      pendingTournamentRoomReservations: vi
        .fn()
        .mockResolvedValue(reservations),
    };
    const rooms = {
      reserveTournamentGame: vi.fn().mockResolvedValue({}),
    };
    const service = new TournamentRoomRecoveryService(
      tournaments as never,
      rooms as never,
    );

    await service.onApplicationBootstrap();

    expect(
      tournaments.pendingTournamentRoomReservations,
    ).toHaveBeenCalledOnce();
    expect(rooms.reserveTournamentGame).toHaveBeenCalledTimes(2);
    expect(rooms.reserveTournamentGame).toHaveBeenNthCalledWith(
      1,
      reservations[0],
    );
    expect(rooms.reserveTournamentGame).toHaveBeenNthCalledWith(
      2,
      reservations[1],
    );
  });
});
