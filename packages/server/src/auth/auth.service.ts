// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createId } from "@paralleldrive/cuid2";
import { hash, verify } from "@node-rs/argon2";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Prisma, type User } from "#prisma/client";
import { PrismaService } from "../db/prisma.service";
import { QqGroupService } from "../qq-group/qq-group.service";
import { RegistrationService } from "../registration/registration.service";
import { assertRegistrationOpen } from "../registration/registration-window";
import { BusinessException } from "../errors";
import { verifyRegistrationCode } from "./registration-code";

const CHALLENGE_TTL_MS = 5 * 60_000;
interface PendingRegistration {
  name: string;
  apply: boolean;
}

type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qqGroup: QqGroupService,
    private readonly registration: RegistrationService,
    private readonly jwtService: JwtService,
  ) {}

  private get rpID() {
    return process.env.WEBAUTHN_RP_ID ?? "localhost";
  }
  private get rpName() {
    return process.env.WEBAUTHN_RP_NAME ?? "Piovium 恋雨杯";
  }
  private get expectedOrigin() {
    return process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";
  }

  private isAdminQq(qq: string) {
    return (process.env.ADMIN_QQS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(qq);
  }

  private async accessToken(user: Pick<User, "id" | "role">) {
    return this.jwtService.signAsync({
      user: 1,
      sub: user.id,
    });
  }

  private async registrationData(tx: Tx, apply: boolean) {
    if (!apply) return {};
    const settings = await tx.registrationSetting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    assertRegistrationOpen(settings);
    return {
      competitionStatus: "REGISTERED" as const,
      appliedAt: new Date(),
    };
  }

  private registeredConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new BusinessException("QQ_ALREADY_REGISTERED", "该 QQ 已注册", 409);
    }
    throw error;
  }

  async checkQq(rawQq: string) {
    const member = await this.qqGroup.findMember(rawQq);
    const exists = await this.prisma.user.findUnique({
      where: { qq: member.qq },
    });
    return { ...member, available: !exists };
  }

  async registerPassword(input: {
    qq: string;
    registrationCode: string;
    name: string;
    password: string;
    apply?: boolean;
  }) {
    if (!input.name.trim()) {
      throw new BusinessException("INVALID_NAME", "昵称不能为空", 400);
    }
    const member = await this.qqGroup.findMember(input.qq, true);
    verifyRegistrationCode(member.qq, input.registrationCode);
    if (await this.prisma.user.findUnique({ where: { qq: member.qq } })) {
      throw new BusinessException("QQ_ALREADY_REGISTERED", "该 QQ 已注册", 409);
    }
    if (input.apply) {
      assertRegistrationOpen(await this.registration.settings());
    }
    const passwordHash = await hash(input.password, {
      algorithm: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) =>
        tx.user.create({
          data: {
            qq: member.qq,
            name: input.name.trim(),
            passwordHash,
            role: this.isAdminQq(member.qq) ? "ADMIN" : "USER",
            ...(await this.registrationData(tx, input.apply ?? false)),
          },
        }),
      );
    } catch (error) {
      this.registeredConflict(error);
    }
    return { accessToken: await this.accessToken(user!), userId: user!.id };
  }

  async loginPassword(rawQq: string, password: string) {
    const qq = this.qqGroup.normalizeQq(rawQq);
    const user = await this.prisma.user.findUnique({ where: { qq } });
    if (!user?.passwordHash || !(await verify(user.passwordHash, password))) {
      throw new UnauthorizedException("QQ 号或密码错误");
    }
    return { accessToken: await this.accessToken(user), userId: user.id };
  }

  async passkeyRegistrationOptions(input: {
    qq: string;
    registrationCode: string;
    name: string;
    apply?: boolean;
  }) {
    if (!input.name.trim()) {
      throw new BusinessException("INVALID_NAME", "昵称不能为空", 400);
    }
    const member = await this.qqGroup.findMember(input.qq, true);
    verifyRegistrationCode(member.qq, input.registrationCode);
    if (await this.prisma.user.findUnique({ where: { qq: member.qq } })) {
      throw new BusinessException("QQ_ALREADY_REGISTERED", "该 QQ 已注册", 409);
    }
    if (input.apply) {
      assertRegistrationOpen(await this.registration.settings());
    }
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userName: member.qq,
      userDisplayName: input.name.trim(),
      userID: new Uint8Array(Buffer.from(member.qq, "utf8")),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    const challengeId = createId();
    const payload: PendingRegistration = {
      name: input.name.trim(),
      apply: input.apply ?? false,
    };
    await this.prisma.authChallenge.create({
      data: {
        id: challengeId,
        kind: "REGISTRATION",
        qq: member.qq,
        challenge: options.challenge,
        payload: payload as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    return { challengeId, options };
  }

  async verifyPasskeyRegistration(
    challengeId: string,
    response: RegistrationResponseJSON,
  ) {
    const challenge = await this.consumeChallenge(challengeId, "REGISTRATION");
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.expectedOrigin,
      expectedRPID: this.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified) {
      throw new UnauthorizedException(
        "Passkey registration verification failed",
      );
    }
    const payload = challenge.payload as unknown as PendingRegistration;
    await this.qqGroup.findMember(challenge.qq, true);
    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) =>
        tx.user.create({
          data: {
            qq: challenge.qq,
            name: payload.name,
            role: this.isAdminQq(challenge.qq) ? "ADMIN" : "USER",
            ...(await this.registrationData(tx, payload.apply)),
            passkeys: {
              create: {
                id: credential.id,
                publicKey: Buffer.from(credential.publicKey),
                counter: BigInt(credential.counter),
                transports: credential.transports ?? [],
                deviceType: credentialDeviceType,
                backedUp: credentialBackedUp,
              },
            },
          },
        }),
      );
    } catch (error) {
      this.registeredConflict(error);
    }
    return { accessToken: await this.accessToken(user!), userId: user!.id };
  }

  async passkeyAuthenticationOptions(rawQq: string) {
    const qq = this.qqGroup.normalizeQq(rawQq);
    const user = await this.prisma.user.findUnique({
      where: { qq },
      include: { passkeys: true },
    });
    if (!user || user.passkeys.length === 0) {
      throw new UnauthorizedException("该账号没有可用的 Passkey");
    }
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: "required",
      allowCredentials: user.passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports as AuthenticatorTransportFuture[],
      })),
    });
    const challengeId = createId();
    await this.prisma.authChallenge.create({
      data: {
        id: challengeId,
        kind: "AUTHENTICATION",
        qq,
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    return { challengeId, options };
  }

  async verifyPasskeyAuthentication(
    challengeId: string,
    response: AuthenticationResponseJSON,
  ) {
    const challenge = await this.consumeChallenge(
      challengeId,
      "AUTHENTICATION",
    );
    const passkey = await this.prisma.passkey.findUnique({
      where: { id: response.id },
      include: { user: true },
    });
    if (!passkey || passkey.user.qq !== challenge.qq) {
      throw new UnauthorizedException("Passkey 不属于该账号");
    }
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.expectedOrigin,
      expectedRPID: this.rpID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: true,
    });
    if (!verification.verified)
      throw new UnauthorizedException("Passkey 验证失败");
    const updated = await this.prisma.passkey.updateMany({
      where: { id: passkey.id, counter: passkey.counter },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new UnauthorizedException("Passkey 计数器已被更新，请重试");
    }
    return {
      accessToken: await this.accessToken(passkey.user),
      userId: passkey.user.id,
    };
  }

  private async consumeChallenge(
    id: string,
    kind: "REGISTRATION" | "AUTHENTICATION",
  ) {
    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.authChallenge.findUnique({ where: { id } });
      if (
        !challenge ||
        challenge.kind !== kind ||
        challenge.usedAt ||
        challenge.expiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException("Passkey challenge 无效或已过期");
      }
      const consumed = await tx.authChallenge.updateMany({
        where: { id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException("Passkey challenge 已被使用");
      }
      return challenge;
    });
  }

  async signGuest(playerId: string) {
    return this.jwtService.signAsync({ user: 0, sub: playerId });
  }
}
