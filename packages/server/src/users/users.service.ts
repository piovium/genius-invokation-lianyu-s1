// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import { BusinessException } from "../errors";
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
            OR: [
              { appliedAt: { lt: user.appliedAt } },
              { appliedAt: user.appliedAt, id: { lte: user.id } },
            ],
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

  async findPublicById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, chessboardColor: true },
    });
  }

  async findAvatarQq(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { qq: true },
    });
  }

  async updateUserInfo(id: number, dto: UpdateUserInfoDto) {
    const { name, ...otherInfo } = dto;
    if (name !== undefined) {
      const { count } = await this.prisma.user.updateMany({
        where: { id, competitionStatus: "NONE" },
        data: { name },
      });
      if (count === 0) {
        throw new BusinessException(
          "NICKNAME_LOCKED_AFTER_REGISTRATION",
          "报名后不可修改昵称",
          409,
        );
      }
    }
    if (Object.keys(otherInfo).length > 0) {
      await this.prisma.user.update({ where: { id }, data: otherInfo });
    }
    return this.findById(id);
  }
}
