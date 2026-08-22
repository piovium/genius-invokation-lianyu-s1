// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  generateRegistrationCode,
  verifyRegistrationCode,
} from "./registration-code";

describe("registration code", () => {
  const qq = "12345678";
  const secret = "test-secret";
  const issuedAt = 1_700_000_000;

  it("round-trips the bot-compatible timestamp and HMAC token", () => {
    const token = generateRegistrationCode(qq, secret, issuedAt);
    expect(token).toMatch(/^1700000000\.[0-9a-f]{64}$/);
    expect(() =>
      verifyRegistrationCode(qq, token, secret, issuedAt + 60, 1800),
    ).not.toThrow();
  });

  it("rejects expired and tampered codes", () => {
    const token = generateRegistrationCode(qq, secret, issuedAt);
    expect(() =>
      verifyRegistrationCode(qq, token, secret, issuedAt + 1801, 1800),
    ).toThrow();
    expect(() =>
      verifyRegistrationCode("87654321", token, secret, issuedAt + 60, 1800),
    ).toThrow();
  });
});
