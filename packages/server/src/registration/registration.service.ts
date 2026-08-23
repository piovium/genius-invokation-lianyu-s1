// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import { QqGroupService } from "../qq-group/qq-group.service";
import { BusinessException } from "../errors";
import { isPlayerInRunningRoom } from "../rooms/room-runtime";
import {
  assertRegistrationOpen,
  registrationWindowState,
} from "./registration-window";

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
    const state = registrationWindowState(settings);
    return { ...settings, registeredCount, state, isOpen: state === "OPEN" };
  }

  async apply(userId: number, verifyMembership = true) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (verifyMembership) await this.qqGroup.findMember(user.qq, true);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(22001, ${userId})`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: userId },
      });
      const settings = await tx.registrationSetting.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
      });
      assertRegistrationOpen(settings);
      const updated =
        current.competitionStatus === "NONE"
          ? await tx.user.update({
              where: { id: userId },
              data: { competitionStatus: "REGISTERED", appliedAt: new Date() },
            })
          : current;
      const appliedAt = updated.appliedAt ?? new Date();
      const position = await tx.user.count({
        where: {
          competitionStatus: { not: "NONE" },
          OR: [
            { appliedAt: { lt: appliedAt } },
            { appliedAt, id: { lte: updated.id } },
          ],
        },
      });
      return {
        competitionStatus: updated.competitionStatus,
        position,
        waitlisted: settings.limit > 0 && position > settings.limit,
        limit: settings.limit,
      };
    });
  }

  async withdraw(userId: number) {
    if (isPlayerInRunningRoom(userId)) {
      throw new BusinessException(
        "USER_IN_RUNNING_GAME",
        "当前盘次正在进行，请先结束对局",
        409,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(22001, ${userId})`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      let closedGameIds: number[] = [];
      if (user.activeMatchId) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(22002, ${user.activeMatchId})`;
        if (isPlayerInRunningRoom(userId)) {
          throw new BusinessException(
            "USER_IN_RUNNING_GAME",
            "当前盘次正在进行，请先结束对局",
            409,
          );
        }
        await tx.matchParticipant.updateMany({
          where: { matchId: user.activeMatchId, userId },
          data: { status: "WITHDRAWN" },
        });
        closedGameIds = (
          await tx.game.findMany({
            where: { matchId: user.activeMatchId, status: "PENDING" },
            select: { id: true },
          })
        ).map((game) => game.id);
        await tx.game.updateMany({
          where: { matchId: user.activeMatchId, status: "PENDING" },
          data: {
            status: "FINISHED",
            endReason: "ADMIN",
            countForStats: false,
            finishedAt: new Date(),
          },
        });
        await tx.tournamentMatch.update({
          where: { id: user.activeMatchId },
          data: { autoCreateGame: false },
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
      return { competitionStatus: "NONE" as const, closedGameIds };
    });
  }
}
