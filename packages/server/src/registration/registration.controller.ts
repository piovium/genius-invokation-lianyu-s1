// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/auth.guard";
import { RegistrationService } from "./registration.service";

@Controller("registration")
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Public()
  @Get("settings")
  settings() {
    return this.registration.settings();
  }
}
