// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
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
  @Matches(/\S/)
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

  @Public()
  @Get(":id/avatar")
  async avatar(
    @Param("id", ParseIntPipe) id: number,
    @Res() reply: FastifyReply,
  ) {
    const user = await this.users.findAvatarQq(id);
    if (!user) throw new NotFoundException();
    let response: Response;
    try {
      response = await fetch(
        `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(user.qq)}&s=640`,
        { signal: AbortSignal.timeout(5000) },
      );
    } catch {
      throw new BadGatewayException("头像服务暂时不可用");
    }
    if (!response.ok) {
      throw new BadGatewayException("头像服务暂时不可用");
    }
    reply
      .header(
        "Content-Type",
        response.headers.get("content-type") ?? "image/jpeg",
      )
      .header("Cache-Control", "public, max-age=3600")
      .send(Buffer.from(await response.arrayBuffer()));
  }

  @Get(":id")
  async getUser(@Param("id", ParseIntPipe) id: number) {
    const user = await this.users.findPublicById(id);
    if (!user) throw new NotFoundException();
    return user;
  }
}
