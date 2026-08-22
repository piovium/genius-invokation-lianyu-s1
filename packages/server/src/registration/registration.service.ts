// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import { QqGroupService } from "../qq-group/qq-group.service";
import { BusinessException } from "../errors";

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qqGroup: QqGroupService,
  ) {}

  async settings() {
    const settings = await this.prisma.registrationSetting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    const registeredCount = await this.prisma.user.count({
      where: { competitionStatus: { not: "NONE" } },
    });
    const isOpen =
      !settings.cutoffAt || settings.cutoffAt.getTime() > Date.now();
    return { ...settings, registeredCount, isOpen };
  }

  async apply(userId: number, verifyMembership = true) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const settings = await this.settings();
    if (!settings.isOpen) {
      throw new BusinessException("REGISTRATION_CLOSED", "报名已经截止", 409);
    }
    if (verifyMembership) await this.qqGroup.findMember(user.qq, true);
    if (user.competitionStatus === "NONE") {
      await this.prisma.user.update({
        where: { id: userId },
        data: { competitionStatus: "REGISTERED", appliedAt: new Date() },
      });
    }
    const position = await this.prisma.user.count({
      where: {
        competitionStatus: { not: "NONE" },
        appliedAt: { lte: user.appliedAt ?? new Date() },
      },
    });
    return {
      competitionStatus:
        user.competitionStatus === "NONE"
          ? "REGISTERED"
          : user.competitionStatus,
      position,
      waitlisted: settings.limit > 0 && position > settings.limit,
      limit: settings.limit,
    };
  }

  async withdraw(userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.activeMatchId) {
        const openGame = await tx.game.findFirst({
          where: { matchId: user.activeMatchId, status: "PENDING" },
          select: { id: true },
        });
        if (openGame) {
          throw new BusinessException(
            "USER_IN_RUNNING_GAME",
            "当前盘次存在开放对局，请先由管理员介入终止",
            409,
            { gameId: openGame.id },
          );
        }
        await tx.matchParticipant.updateMany({
          where: { matchId: user.activeMatchId, userId },
          data: { status: "WITHDRAWN" },
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          competitionStatus: "NONE",
          appliedAt: null,
          activeMatchId: null,
        },
      });
      return { competitionStatus: "NONE" as const };
    });
  }
}
