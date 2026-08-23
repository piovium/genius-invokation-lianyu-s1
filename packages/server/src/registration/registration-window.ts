// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { BusinessException } from "../errors";

type RegistrationWindow = {
  opensAt: Date | null;
  cutoffAt: Date | null;
};

export type RegistrationWindowState = "NOT_STARTED" | "OPEN" | "CLOSED";

export function registrationWindowState(
  settings: RegistrationWindow,
  now = Date.now(),
): RegistrationWindowState {
  if (settings.opensAt && settings.opensAt.getTime() > now) {
    return "NOT_STARTED";
  }
  if (settings.cutoffAt && settings.cutoffAt.getTime() <= now) {
    return "CLOSED";
  }
  return "OPEN";
}

export function assertRegistrationOpen(
  settings: RegistrationWindow,
  now = Date.now(),
) {
  const state = registrationWindowState(settings, now);
  if (state === "NOT_STARTED") {
    throw new BusinessException(
      "REGISTRATION_NOT_STARTED",
      "报名尚未开始",
      409,
    );
  }
  if (state === "CLOSED") {
    throw new BusinessException("REGISTRATION_CLOSED", "报名已经截止", 409);
  }
}
