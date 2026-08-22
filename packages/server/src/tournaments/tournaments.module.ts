// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { AdminGuard } from "../auth/admin.guard";
import {
  AdminTournamentsController,
  TournamentGamesController,
} from "./tournaments.controller";
import { TournamentsService } from "./tournaments.service";
import { RoomsModule } from "../rooms/rooms.module";

@Module({
  imports: [DbModule, RoomsModule],
  providers: [TournamentsService, AdminGuard],
  controllers: [AdminTournamentsController, TournamentGamesController],
  exports: [TournamentsService],
})
export class TournamentsModule {}
