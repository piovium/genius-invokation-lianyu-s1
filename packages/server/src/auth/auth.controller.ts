// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from "class-validator";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { AuthService } from "./auth.service";
import { Public } from "./auth.guard";

class QqDto {
  @Matches(/^\d{5,12}$/)
  qq!: string;
}

class RegistrationDto extends QqDto {
  @IsString()
  @IsNotEmpty()
  registrationCode!: string;

  @Length(1, 64)
  name!: string;

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
  constructor(private readonly auth: AuthService) {}

  @Post("registration/qq-check")
  qqCheck(@Body() { qq }: QqDto) {
    return this.auth.checkQq(qq);
  }

  @Post("register/password")
  registerPassword(@Body() dto: PasswordRegistrationDto) {
    return this.auth.registerPassword(dto);
  }

  @Post("register/passkey/options")
  registerPasskeyOptions(@Body() dto: RegistrationDto) {
    return this.auth.passkeyRegistrationOptions(dto);
  }

  @Post("register/passkey/verify")
  registerPasskeyVerify(@Body() dto: PasskeyResponseDto) {
    return this.auth.verifyPasskeyRegistration(
      dto.challengeId,
      dto.response as RegistrationResponseJSON,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post("login/password")
  loginPassword(@Body() dto: PasswordLoginDto) {
    return this.auth.loginPassword(dto.qq, dto.password);
  }

  @Post("login/passkey/options")
  loginPasskeyOptions(@Body() dto: QqDto) {
    return this.auth.passkeyAuthenticationOptions(dto.qq);
  }

  @HttpCode(HttpStatus.OK)
  @Post("login/passkey/verify")
  loginPasskeyVerify(@Body() dto: PasskeyResponseDto) {
    return this.auth.verifyPasskeyAuthentication(
      dto.challengeId,
      dto.response as AuthenticationResponseJSON,
    );
  }
}
