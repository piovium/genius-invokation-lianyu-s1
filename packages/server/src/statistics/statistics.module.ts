// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Module } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { DbModule } from "../db/db.module";
import { StatisticsController } from "./statistics.controller";
import { StatisticsService } from "./statistics.service";

@Module({
  imports: [DbModule],
  providers: [StatisticsService, AdminGuard],
  controllers: [StatisticsController],
})
export class StatisticsModule {}
