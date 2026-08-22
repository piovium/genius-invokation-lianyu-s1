// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { IsOptional, Length, Matches } from "class-validator";
import { UsersService, type UserInfo } from "./users.service";
import { User } from "../auth/user.decorator";
import { Public } from "../auth/auth.guard";
import { RegistrationService } from "../registration/registration.service";

export class UpdateUserInfoDto {
  @Matches(/^#[0-9a-fA-F]{6}$/)
  @IsOptional()
  chessboardColor?: string | null;

  @Length(1, 64)
  @IsOptional()
  name?: string;
}

@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly registration: RegistrationService,
  ) {}

  @Get("me")
  @Public()
  async me(@User() userId: number | null): Promise<UserInfo | null> {
    if (userId === null) return null;
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException();
    return user;
  }

  @Patch("me")
  updateMe(@User() userId: number, @Body() userInfo: UpdateUserInfoDto) {
    return this.users.updateUserInfo(userId, userInfo);
  }

  @Post("me/registration")
  register(@User() userId: number) {
    return this.registration.apply(userId);
  }

  @Delete("me/registration")
  withdraw(@User() userId: number) {
    return this.registration.withdraw(userId);
  }

  @Get("me/matches")
  matches(@User() userId: number) {
    return this.users.activeMatches(userId);
  }

  @Get(":id")
  async getUser(@Param("id", ParseIntPipe) id: number): Promise<UserInfo> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException();
    return user;
  }
}
