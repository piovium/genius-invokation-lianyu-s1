// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
} from "class-validator";
import { AdminGuard } from "../auth/admin.guard";
import { StatisticsService } from "./statistics.service";

class RankingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  eventIds!: number[];
}

class StatisticsQueryDto {
  @IsIn(["all", "tournament", "casual"])
  @IsOptional()
  source: "all" | "tournament" | "casual" = "all";
}

@UseGuards(AdminGuard)
@Controller("admin")
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @Get("statistics/cards")
  cards(@Query() { source }: StatisticsQueryDto) {
    return this.statistics.cards(source);
  }

  @Get("statistics/users")
  users(@Query() { source }: StatisticsQueryDto) {
    return this.statistics.users(source);
  }

  @Post("rankings/preview")
  rankings(@Body() { eventIds }: RankingsDto) {
    return this.statistics.rankings(eventIds);
  }
}
