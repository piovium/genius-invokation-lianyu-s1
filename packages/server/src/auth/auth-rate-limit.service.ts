// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { HttpStatus, Injectable } from "@nestjs/common";
import { BusinessException } from "../errors";

interface WindowCounter {
  count: number;
  resetsAt: number;
}

@Injectable()
export class AuthRateLimitService {
  private readonly counters = new Map<string, WindowCounter>();

  consume(scope: string, identity: string, limit: number, windowMs: number) {
    const now = Date.now();
    if (this.counters.size > 10_000) {
      for (const [storedKey, counter] of this.counters) {
        if (counter.resetsAt <= now) this.counters.delete(storedKey);
      }
    }
    const key = `${scope}:${identity}`;
    const current = this.counters.get(key);
    if (!current || current.resetsAt <= now) {
      this.counters.set(key, { count: 1, resetsAt: now + windowMs });
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      throw new BusinessException(
        "AUTH_RATE_LIMITED",
        "请求过于频繁，请稍后重试",
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterMs: current.resetsAt - now },
      );
    }
  }
}
