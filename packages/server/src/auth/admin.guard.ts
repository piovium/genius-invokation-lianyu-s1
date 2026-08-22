// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import { isUserJwtPayload } from "./user.decorator";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ auth?: unknown }>();
    if (!isUserJwtPayload(request.auth)) {
      throw new ForbiddenException("Administrator access required");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: request.auth.sub },
      select: { role: true },
    });
    if (user?.role !== "ADMIN") {
      throw new ForbiddenException("Administrator access required");
    }
    return true;
  }
}
