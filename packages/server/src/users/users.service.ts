// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import type { UpdateUserInfoDto } from "./users.controller";

export interface UserInfo {
  id: number;
  qq: string;
  login: string;
  name: string;
  avatarUrl: string;
  chessboardColor?: string | null;
  role: "USER" | "ADMIN";
  competitionStatus: "NONE" | "REGISTERED" | "PLAYER";
  appliedAt: Date | null;
  queuePosition: number | null;
  waitlisted: boolean;
  activeMatchId: number | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<UserInfo | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    const settings = await this.prisma.registrationSetting.findUnique({
      where: { id: 1 },
    });
    const queuePosition = user.appliedAt
      ? await this.prisma.user.count({
          where: {
            competitionStatus: { not: "NONE" },
            appliedAt: { lte: user.appliedAt },
          },
        })
      : null;
    return {
      id: user.id,
      qq: user.qq,
      login: user.qq,
      name: user.name,
      avatarUrl: `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(user.qq)}&s=640`,
      chessboardColor: user.chessboardColor,
      role: user.role,
      competitionStatus: user.competitionStatus,
      appliedAt: user.appliedAt,
      queuePosition,
      waitlisted: !!(
        queuePosition &&
        settings?.limit &&
        queuePosition > settings.limit
      ),
      activeMatchId: user.activeMatchId,
    };
  }

  async updateUserInfo(id: number, dto: UpdateUserInfoDto) {
    await this.prisma.user.update({ where: { id }, data: dto });
    return this.findById(id);
  }

  async activeMatches(userId: number) {
    return this.prisma.tournamentMatch.findMany({
      where: {
        event: { phase: { in: ["DECK_COLLECTION", "RUNNING"] } },
        participants: { some: { userId } },
      },
      include: {
        event: true,
        participants: {
          include: {
            user: { select: { id: true, name: true, qq: true } },
          },
          orderBy: { who: "asc" },
        },
        games: {
          include: { players: true },
          orderBy: { createdAt: "desc" },
        },
        matchDecks: { where: { userId } },
      },
      orderBy: { scheduledStart: "desc" },
    });
  }
}
