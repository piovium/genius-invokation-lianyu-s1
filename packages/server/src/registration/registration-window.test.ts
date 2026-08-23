// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  assertRegistrationOpen,
  registrationWindowState,
} from "./registration-window";

const now = new Date("2026-08-23T12:00:00.000Z").getTime();

describe("registration window", () => {
  it("opens only after the configured start and before the cutoff", () => {
    expect(
      registrationWindowState(
        {
          opensAt: new Date("2026-08-23T13:00:00.000Z"),
          cutoffAt: new Date("2026-08-24T12:00:00.000Z"),
        },
        now,
      ),
    ).toBe("NOT_STARTED");
    expect(
      registrationWindowState(
        {
          opensAt: new Date("2026-08-23T11:00:00.000Z"),
          cutoffAt: new Date("2026-08-23T12:00:00.000Z"),
        },
        now,
      ),
    ).toBe("CLOSED");
    expect(
      registrationWindowState(
        {
          opensAt: new Date("2026-08-23T11:00:00.000Z"),
          cutoffAt: new Date("2026-08-23T13:00:00.000Z"),
        },
        now,
      ),
    ).toBe("OPEN");
  });

  it("keeps an unbounded window open", () => {
    expect(
      registrationWindowState({ opensAt: null, cutoffAt: null }, now),
    ).toBe("OPEN");
  });

  it("returns distinct errors for early and late applications", () => {
    expect(() =>
      assertRegistrationOpen(
        {
          opensAt: new Date("2026-08-23T13:00:00.000Z"),
          cutoffAt: null,
        },
        now,
      ),
    ).toThrow("报名尚未开始");
    expect(() =>
      assertRegistrationOpen(
        {
          opensAt: null,
          cutoffAt: new Date("2026-08-23T12:00:00.000Z"),
        },
        now,
      ),
    ).toThrow("报名已经截止");
  });
});
