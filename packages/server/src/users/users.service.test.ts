// Copyright (C) 2026 Piovium Labs
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";

vi.mock("../db/prisma.service", () => ({ PrismaService: class {} }));

import { UsersService } from "./users.service";

describe("UsersService nickname updates", () => {
  it("updates the nickname only while the user is not registered", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { user: { updateMany, update: vi.fn() } };
    const service = new UsersService(prisma as never);
    vi.spyOn(service, "findById").mockResolvedValue(null);

    await service.updateUserInfo(7, { name: "新昵称" });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 7, competitionStatus: "NONE" },
      data: { name: "新昵称" },
    });
  });

  it("rejects nickname updates after registration", async () => {
    const prisma = {
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
      },
    };
    const service = new UsersService(prisma as never);

    await expect(
      service.updateUserInfo(7, { name: "赛后昵称" }),
    ).rejects.toMatchObject({
      response: {
        code: "NICKNAME_LOCKED_AFTER_REGISTRATION",
        message: "报名后不可修改昵称",
      },
      status: 409,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("still allows other profile fields to be updated after registration", async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = { user: { updateMany: vi.fn(), update } };
    const service = new UsersService(prisma as never);
    vi.spyOn(service, "findById").mockResolvedValue(null);

    await service.updateUserInfo(7, { chessboardColor: "#123456" });

    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { chessboardColor: "#123456" },
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
