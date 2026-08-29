// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Transform, type TransformFnParams } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
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

function csvValues({ value }: TransformFnParams) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) =>
    typeof item === "string" ? item.split(",").filter(Boolean) : [item],
  );
}

function csvNumbers(params: TransformFnParams) {
  return csvValues(params).map(Number);
}

function booleanValue({ value }: TransformFnParams) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return value;
}

export class StatisticsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  createdAtFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  createdAtTo?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(["tournament", "casual"], { each: true })
  @Transform(csvValues)
  sources: ("tournament" | "casual")[] = ["tournament", "casual"];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Transform(csvNumbers)
  eventIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(14, { each: true })
  @Transform(csvNumbers)
  roundCounts?: number[];

  @IsBoolean()
  @Transform(booleanValue)
  includeSurrender = true;

  @IsBoolean()
  @Transform(booleanValue)
  includeAdmin = true;
}

@UseGuards(AdminGuard)
@Controller("admin")
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @Get("statistics/cards")
  cards(@Query() query: StatisticsQueryDto) {
    return this.statistics.cards(query);
  }

  @Get("statistics/users")
  users(@Query() query: StatisticsQueryDto) {
    return this.statistics.users(query);
  }

  @Get("statistics/options")
  options() {
    return this.statistics.options();
  }

  @Post("rankings/preview")
  rankings(@Body() { eventIds }: RankingsDto) {
    return this.statistics.rankings(eventIds);
  }
}
