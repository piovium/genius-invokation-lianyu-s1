// Copyright (C) 2024-2025 Guyutongxue
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Put,
} from "@nestjs/common";
import { User } from "../auth/user.decorator";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { DecksService } from "./decks.service";
import { PaginationDto, parseStringToInt } from "../utils";
import { VERSIONS, type Version } from "@gi-tcg/core";
import { Transform } from "class-transformer";
import { Type } from "class-transformer";
import type { Deck } from "@gi-tcg/typings";
import { Public } from "../auth/auth.guard";

export class DeckDto implements Deck {
  @IsInt({ each: true })
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  characters!: number[];

  @IsInt({ each: true })
  @ArrayMinSize(30)
  @ArrayMaxSize(30)
  cards!: number[];
}

export class CreateDeckDto extends DeckDto {
  @Length(1, 64)
  name!: string;
}

export class ImportDeckDto extends CreateDeckDto {
  @IsString()
  @Length(1, 128)
  clientImportKey!: string;
}

export class UpdateDeckDto {
  @Length(1, 64)
  @IsOptional()
  name?: string;

  @IsInt({ each: true })
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsOptional()
  characters?: number[];

  @IsInt({ each: true })
  @ArrayMinSize(30)
  @ArrayMaxSize(30)
  @IsOptional()
  cards?: number[];
}

export class QueryDeckDto extends PaginationDto {
  @IsInt()
  @Min(0)
  @Max(VERSIONS.length - 1)
  @IsOptional()
  @Transform(parseStringToInt)
  requiredVersion?: number;
}

export class ImportDecksDto {
  @ValidateNested({ each: true })
  @Type(() => ImportDeckDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  decks!: ImportDeckDto[];
}

@Controller("decks")
export class DecksController {
  constructor(private decks: DecksService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post()
  async createDeck(@User() userId: number, @Body() deck: CreateDeckDto) {
    const result = await this.decks.createDeck(userId, deck);
    return {
      id: result.id,
      code: result.code,
    };
  }

  @Post("version")
  @Public()
  verifyVersion(@Body() deck: CreateDeckDto) {
    return this.decks.deckToCode(deck);
  }

  @Post("import")
  importDecks(@User() userId: number, @Body() { decks }: ImportDecksDto) {
    return this.decks.importDecks(userId, decks);
  }

  @Put(":deckId/competition")
  selectCompetitionDeck(
    @User() userId: number,
    @Param("deckId", ParseIntPipe) deckId: number,
  ) {
    return this.decks.selectCompetitionDeck(userId, deckId);
  }

  @Delete(":deckId/competition")
  async unselectCompetitionDeck(
    @User() userId: number,
    @Param("deckId", ParseIntPipe) deckId: number,
  ) {
    await this.decks.unselectCompetitionDeck(userId, deckId);
    return { message: `deck ${deckId} removed from competition` };
  }

  @Get()
  async getAllDecks(@User() userId: number, @Query() pagination: QueryDeckDto) {
    return await this.decks.getAllDecks(userId, pagination);
  }

  @Get(":deckId")
  async getDeck(
    @User() userId: number,
    @Param("deckId", ParseIntPipe) deckId: number,
  ) {
    const deck = await this.decks.getDeck(userId, deckId);
    if (deck === null) {
      throw new NotFoundException();
    }
    return deck;
  }

  @Patch(":deckId")
  async updateDeck(
    @User() userId: number,
    @Param("deckId", ParseIntPipe) deckId: number,
    @Body() deck: UpdateDeckDto,
  ) {
    return await this.decks.updateDeck(userId, deckId, deck);
  }

  @Delete(":deckId")
  async deleteDeck(
    @User() userId: number,
    @Param("deckId", ParseIntPipe) deckId: number,
  ) {
    await this.decks.deleteDeck(userId, deckId);
    return { message: `deck ${deckId} deleted` };
  }
}
