// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHmac, timingSafeEqual } from "node:crypto";
import { BusinessException } from "../errors";

export function generateRegistrationCode(
  qq: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const signature = createHmac("sha256", secret)
    .update(`${qq}.${timestamp}`)
    .digest("hex");
  return `${timestamp}.${signature}`;
}

export function verifyRegistrationCode(
  qq: string,
  token: string,
  secret = process.env.REGISTRATION_CODE_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = Number(process.env.REGISTRATION_CODE_TTL_SECONDS ?? "1800"),
) {
  if (!secret) {
    if (process.env.NODE_ENV !== "production" && token === "dev") return;
    throw new BusinessException(
      "REGISTRATION_CODE_INVALID",
      "注册码服务尚未配置",
      503,
    );
  }
  const [timestampText, provided] = token.split(".");
  const timestamp = Number(timestampText);
  if (!provided || !Number.isSafeInteger(timestamp)) {
    throw new BusinessException("REGISTRATION_CODE_INVALID", "注册码无效", 401);
  }
  if (timestamp > nowSeconds + 60 || nowSeconds - timestamp > ttlSeconds) {
    throw new BusinessException(
      "REGISTRATION_CODE_EXPIRED",
      "注册码已过期",
      401,
    );
  }
  const expected = generateRegistrationCode(qq, secret, timestamp).split(
    ".",
  )[1]!;
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided.toLowerCase(), "utf8");
  if (
    expectedBytes.length !== providedBytes.length ||
    !timingSafeEqual(expectedBytes, providedBytes)
  ) {
    throw new BusinessException("REGISTRATION_CODE_INVALID", "注册码无效", 401);
  }
}
