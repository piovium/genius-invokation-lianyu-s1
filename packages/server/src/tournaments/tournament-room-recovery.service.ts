// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { RoomsService } from "../rooms/rooms.service";
import { TournamentsService } from "./tournaments.service";

@Injectable()
export class TournamentRoomRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TournamentRoomRecoveryService.name);

  constructor(
    private readonly tournaments: TournamentsService,
    private readonly rooms: RoomsService,
  ) {}

  async onApplicationBootstrap() {
    const reservations =
      await this.tournaments.pendingTournamentRoomReservations();
    const results = await Promise.allSettled(
      reservations.map((reservation) =>
        this.rooms.reserveTournamentGame(reservation),
      ),
    );
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        this.logger.error(
          `Failed to restore tournament room for game ${reservations[index]!.gameId}: ${result.reason}`,
        );
      }
    });
    const restored = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    this.logger.log(
      `Restored ${restored}/${reservations.length} pending tournament rooms`,
    );
  }
}
