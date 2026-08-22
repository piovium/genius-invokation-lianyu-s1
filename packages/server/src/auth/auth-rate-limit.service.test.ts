// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { AuthRateLimitService } from "./auth-rate-limit.service";

describe("AuthRateLimitService", () => {
  it("rejects requests after the configured limit", () => {
    const service = new AuthRateLimitService();
    service.consume("login", "example", 2, 60_000);
    service.consume("login", "example", 2, 60_000);
    expect(() => service.consume("login", "example", 2, 60_000)).toThrow(
      "请求过于频繁",
    );
  });

  it("keeps counters isolated by scope and identity", () => {
    const service = new AuthRateLimitService();
    service.consume("login", "one", 1, 60_000);
    expect(() => service.consume("register", "one", 1, 60_000)).not.toThrow();
    expect(() => service.consume("login", "two", 1, 60_000)).not.toThrow();
  });
});
