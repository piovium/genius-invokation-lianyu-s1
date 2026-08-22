// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Injectable } from "@nestjs/common";
import { BusinessException } from "../errors";

interface QqMember {
  user_id: number;
  nickname: string;
  card?: string;
}

@Injectable()
export class QqGroupService {
  private cache: { expiresAt: number; members: QqMember[] } | null = null;

  normalizeQq(value: string) {
    const qq = value.trim().replace(/^0+/, "");
    if (!/^\d{5,12}$/.test(qq)) {
      throw new BusinessException("QQ_INVALID", "QQ 号格式无效");
    }
    return qq;
  }

  async findMember(rawQq: string, force = false) {
    const qq = this.normalizeQq(rawQq);
    const now = Date.now();
    if (!force && this.cache && this.cache.expiresAt > now) {
      return this.findInList(this.cache.members, qq);
    }
    const origin = process.env.BOT_SERVER_ORIGIN;
    const token = process.env.BOT_SERVER_TOKEN;
    if (!origin || !token) {
      if (process.env.NODE_ENV !== "production") {
        return { qq, nickname: qq };
      }
      throw new BusinessException(
        "QQ_GROUP_SERVICE_UNAVAILABLE",
        "赛事群服务尚未配置",
        503,
      );
    }
    try {
      const response = await fetch(
        `${origin.replace(/\/$/, "")}/get_group_member_list`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            group_id: Number(process.env.BOT_GROUP_ID ?? "1016833703"),
            no_cache: true,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const members = (await response.json()) as QqMember[];
      if (!Array.isArray(members)) throw new Error("Invalid member list");
      this.cache = { expiresAt: now + 60_000, members };
      return this.findInList(members, qq);
    } catch (error) {
      throw new BusinessException(
        "QQ_GROUP_SERVICE_UNAVAILABLE",
        "暂时无法查询赛事群成员",
        503,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  private findInList(members: QqMember[], qq: string) {
    const member = members.find(({ user_id }) => String(user_id) === qq);
    if (!member) {
      throw new BusinessException(
        "QQ_NOT_IN_GROUP",
        "该 QQ 当前不在赛事群中",
        403,
      );
    }
    return { qq, nickname: member.card?.trim() || member.nickname || qq };
  }
}
