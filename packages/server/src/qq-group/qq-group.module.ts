// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Module } from "@nestjs/common";
import { QqGroupService } from "./qq-group.service";

@Module({ providers: [QqGroupService], exports: [QqGroupService] })
export class QqGroupModule {}
