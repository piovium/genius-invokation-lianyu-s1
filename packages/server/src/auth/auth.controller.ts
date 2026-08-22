// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import {
  IsBoolean,
  Equals,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from "class-validator";
import type { FastifyRequest } from "fastify";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { AuthService } from "./auth.service";
import { Public } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";

class QqDto {
  @Matches(/^\d{5,12}$/)
  qq!: string;
}

class RegistrationDto extends QqDto {
  @IsString()
  @IsNotEmpty()
  registrationCode!: string;

  @Length(1, 64)
  @Matches(/\S/)
  name!: string;

  @Equals(true)
  acknowledged!: boolean;

  @IsBoolean()
  @IsOptional()
  apply?: boolean;
}

class PasswordRegistrationDto extends RegistrationDto {
  @MinLength(8)
  password!: string;
}

class PasswordLoginDto extends QqDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}

class PasskeyResponseDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsObject()
  response!: RegistrationResponseJSON | AuthenticationResponseJSON;
}

@Public()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly rateLimit: AuthRateLimitService,
  ) {}

  @Post("registration/qq-check")
  qqCheck(@Req() request: FastifyRequest, @Body() { qq }: QqDto) {
    this.rateLimit.consume("qq-check", `${request.ip}:${qq}`, 10, 60_000);
    return this.auth.checkQq(qq);
  }

  @Post("register/password")
  registerPassword(
    @Req() request: FastifyRequest,
    @Body() dto: PasswordRegistrationDto,
  ) {
    this.rateLimit.consume("register-password", request.ip, 5, 10 * 60_000);
    return this.auth.registerPassword(dto);
  }

  @Post("register/passkey/options")
  registerPasskeyOptions(
    @Req() request: FastifyRequest,
    @Body() dto: RegistrationDto,
  ) {
    this.rateLimit.consume("register-passkey", request.ip, 5, 10 * 60_000);
    return this.auth.passkeyRegistrationOptions(dto);
  }

  @Post("register/passkey/verify")
  registerPasskeyVerify(
    @Req() request: FastifyRequest,
    @Body() dto: PasskeyResponseDto,
  ) {
    this.rateLimit.consume("passkey-verify", request.ip, 20, 60_000);
    return this.auth.verifyPasskeyRegistration(
      dto.challengeId,
      dto.response as RegistrationResponseJSON,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post("login/password")
  loginPassword(@Req() request: FastifyRequest, @Body() dto: PasswordLoginDto) {
    this.rateLimit.consume("login-password-ip", request.ip, 20, 60_000);
    this.rateLimit.consume(
      "login-password",
      `${request.ip}:${dto.qq.replace(/^0+/, "")}`,
      5,
      60_000,
    );
    return this.auth.loginPassword(dto.qq, dto.password);
  }

  @Post("login/passkey/options")
  loginPasskeyOptions(@Req() request: FastifyRequest, @Body() dto: QqDto) {
    this.rateLimit.consume("login-passkey", request.ip, 10, 60_000);
    return this.auth.passkeyAuthenticationOptions(dto.qq);
  }

  @HttpCode(HttpStatus.OK)
  @Post("login/passkey/verify")
  loginPasskeyVerify(
    @Req() request: FastifyRequest,
    @Body() dto: PasskeyResponseDto,
  ) {
    this.rateLimit.consume("passkey-verify", request.ip, 20, 60_000);
    return this.auth.verifyPasskeyAuthentication(
      dto.challengeId,
      dto.response as AuthenticationResponseJSON,
    );
  }
}
