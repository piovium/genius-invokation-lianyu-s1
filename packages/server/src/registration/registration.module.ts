// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { QqGroupModule } from "../qq-group/qq-group.module";
import { RegistrationController } from "./registration.controller";
import { RegistrationService } from "./registration.service";

@Module({
  imports: [DbModule, QqGroupModule],
  providers: [RegistrationService],
  controllers: [RegistrationController],
  exports: [RegistrationService],
})
export class RegistrationModule {}
