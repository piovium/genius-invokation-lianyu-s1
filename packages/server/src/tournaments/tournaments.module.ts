// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { AdminGuard } from "../auth/admin.guard";
import {
  AdminTournamentsController,
  ParticipantTournamentsController,
  TournamentGamesController,
} from "./tournaments.controller";
import { TournamentsService } from "./tournaments.service";
import { RoomsModule } from "../rooms/rooms.module";
import { DecksModule } from "../decks/decks.module";
import { RegistrationModule } from "../registration/registration.module";
import { TournamentRoomRecoveryService } from "./tournament-room-recovery.service";

@Module({
  imports: [DbModule, RoomsModule, DecksModule, RegistrationModule],
  providers: [TournamentsService, TournamentRoomRecoveryService, AdminGuard],
  controllers: [
    AdminTournamentsController,
    TournamentGamesController,
    ParticipantTournamentsController,
  ],
  exports: [TournamentsService],
})
export class TournamentsModule {}
