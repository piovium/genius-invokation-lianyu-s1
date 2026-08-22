// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type, Transform } from "class-transformer";
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CompetitionStatus,
  EventPhase,
  GameStatus,
  MatchMode,
} from "#prisma/enums";
import { AdminGuard } from "../auth/admin.guard";
import { User } from "../auth/user.decorator";
import { parseStringToInt } from "../utils";
import { TournamentsService } from "./tournaments.service";
import { RoomsService } from "../rooms/rooms.service";
import { DecksService } from "../decks/decks.service";

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  reason!: string;
}

class EventInputDto {
  @Length(1, 100)
  name!: string;

  @IsEnum(EventPhase)
  initialPhase: EventPhase = EventPhase.DECK_COLLECTION;

  @IsInt()
  @Min(0)
  @Max(100)
  deckLimit = 0;
}

export class MatchTemplateDto {
  @IsISO8601()
  @IsOptional()
  scheduledStart?: string;

  @IsISO8601()
  @IsOptional()
  scheduledEnd?: string;

  @IsEnum(MatchMode)
  mode: MatchMode = MatchMode.UNRESTRICTED;

  @IsInt()
  @Min(1)
  @Max(99)
  maxGames!: number;

  @IsInt()
  @Min(1)
  @Max(99)
  winsRequired!: number;

  @IsBoolean()
  autoCreateGame = false;

  @IsObject()
  roomConfig: Record<string, unknown> = {};
}

export class CreateEventDto extends ReasonDto {
  @ValidateNested()
  @Type(() => EventInputDto)
  event!: EventInputDto;

  @ValidateNested()
  @Type(() => MatchTemplateDto)
  matchTemplate!: MatchTemplateDto;

  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  player0Ids!: number[];

  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  player1Ids!: number[];
}

export class EventPatchDto extends ReasonDto {
  @Length(1, 100)
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  deckLimit?: number;
}

export class MatchPatchDto extends ReasonDto {
  @IsISO8601()
  @IsOptional()
  scheduledStart?: string;

  @IsISO8601()
  @IsOptional()
  scheduledEnd?: string;

  @IsEnum(MatchMode)
  @IsOptional()
  mode?: MatchMode;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxGames?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  winsRequired?: number;

  @IsObject()
  @IsOptional()
  roomConfig?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  autoCreateGame?: boolean;
}

export class MatchInterventionDto extends ReasonDto {
  @IsInt()
  @IsOptional()
  winnerUserId!: number | null;
}

export class GameInterventionDto extends ReasonDto {
  @IsEnum(GameStatus)
  status!: GameStatus;

  @IsIn([0, 1, null])
  @IsOptional()
  manualWinnerWho!: number | null;

  @IsBoolean()
  countForStats!: boolean;
}

export class RegistrationSettingsDto {
  @IsISO8601()
  @IsOptional()
  cutoffAt!: string | null;

  @IsInt()
  @Min(0)
  limit!: number;
}

class StatusBatchDto extends ReasonDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  userIds!: number[];

  @IsEnum(CompetitionStatus)
  status!: CompetitionStatus;
}

class AssignDeckDto extends ReasonDto {
  @IsInt()
  deckId!: number;
}

class SelectDeckDto {
  @IsInt()
  deckId!: number;
}

@UseGuards(AdminGuard)
@Controller("admin")
export class AdminTournamentsController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly rooms: RoomsService,
    private readonly decks: DecksService,
  ) {}

  @Get("registration/settings")
  settings() {
    return this.tournaments.registrationSettings();
  }

  @Patch("registration/settings")
  updateSettings(@Body() dto: RegistrationSettingsDto) {
    return this.tournaments.registrationSettings(dto);
  }

  @Get("users")
  users(
    @Query("status") status?: CompetitionStatus,
    @Query("descending") descending?: string,
  ) {
    return this.tournaments.users(status, descending === "true");
  }

  @Get("users/:id/decks")
  userDecks(@Param("id", ParseIntPipe) id: number) {
    return this.decks.getAllDecks(id, { take: 100 });
  }

  @Patch("users/competition-status")
  statuses(@User() actor: number, @Body() dto: StatusBatchDto) {
    return this.tournaments.setUserStatuses(
      actor,
      dto.userIds,
      dto.status,
      dto.reason,
    );
  }

  @Get("events")
  events() {
    return this.tournaments.listEvents();
  }

  @Post("events")
  createEvent(@User() actor: number, @Body() dto: CreateEventDto) {
    return this.tournaments.createEvent(actor, dto);
  }

  @Get("events/:id")
  event(@Param("id", ParseIntPipe) id: number) {
    return this.tournaments.event(id);
  }

  @Patch("events/:id")
  patchEvent(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: EventPatchDto,
  ) {
    return this.tournaments.patchEvent(actor, id, dto);
  }

  @Post("events/:id/advance")
  async advanceEvent(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() { reason }: ReasonDto,
  ) {
    const event = await this.tournaments.event(id);
    const pendingGameIds =
      event?.matches.flatMap((match) =>
        match.games
          .filter((game) => game.status === "PENDING")
          .map((game) => game.id),
      ) ?? [];
    const result = await this.tournaments.advanceEvent(actor, id, reason);
    if (result.phase === "FINISHED") {
      for (const gameId of pendingGameIds) {
        this.rooms.terminateTournamentGame(gameId);
      }
    }
    return result;
  }

  @Get("events/:id/export")
  exportEvent(@Param("id", ParseIntPipe) id: number) {
    return this.tournaments.exportEvent(id);
  }

  @Get("matches/:id")
  match(@Param("id", ParseIntPipe) id: number) {
    return this.tournaments.match(id);
  }

  @Patch("matches/:id")
  patchMatch(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: MatchPatchDto,
  ) {
    return this.tournaments.patchMatch(actor, id, dto);
  }

  @Post("matches/:id/games")
  createGame(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() { reason }: ReasonDto,
  ) {
    return this.tournaments.createGame(actor, id, reason);
  }

  @Post("matches/:id/auto-win")
  autoWin(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() { reason }: ReasonDto,
  ) {
    return this.tournaments.autoWin(actor, id, reason);
  }

  @Patch("matches/:id/intervention")
  matchIntervention(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: MatchInterventionDto,
  ) {
    return this.tournaments.interveneMatch(actor, id, dto);
  }

  @Put("matches/:id/participants/:userId/decks")
  assignDeck(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Param("userId", ParseIntPipe) userId: number,
    @Body() dto: AssignDeckDto,
  ) {
    return this.tournaments.assignDeck(
      actor,
      id,
      userId,
      dto.deckId,
      dto.reason,
    );
  }

  @Patch("games/:id/intervention")
  gameIntervention(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: GameInterventionDto,
  ) {
    this.rooms.terminateTournamentGame(id);
    return this.tournaments.interveneGame(actor, id, dto);
  }

  @Get("audit-logs")
  auditLogs(
    @Query("skip", new ParseIntPipe({ optional: true })) skip = 0,
    @Query("take", new ParseIntPipe({ optional: true })) take = 30,
  ) {
    return this.tournaments.auditLogs(skip, Math.min(take, 100));
  }
}

@Controller("tournament-games")
export class TournamentGamesController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly rooms: RoomsService,
  ) {}

  @Get(":id/join-options")
  options(@User() userId: number, @Param("id", ParseIntPipe) id: number) {
    return this.tournaments.joinOptions(id, userId);
  }

  @Post(":id/join")
  async join(
    @User() userId: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() { deckId }: SelectDeckDto,
  ) {
    await this.tournaments.chooseDeck(id, userId, deckId);
    const roomData = await this.tournaments.tournamentRoomData(id, userId);
    return this.rooms.joinTournamentGame({
      ...roomData,
      roomConfig: roomData.roomConfig,
      finalize: (result) =>
        this.tournaments.finalizeGame({
          gameId: id,
          ...result,
        }),
    });
  }
}
