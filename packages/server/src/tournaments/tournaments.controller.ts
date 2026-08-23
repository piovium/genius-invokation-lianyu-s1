// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
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
import { RegistrationService } from "../registration/registration.service";
import {
  OptionalReasonDto,
  ReasonDto,
  StatusBatchDto,
} from "./admin-reason.dto";

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

export class CreateEventDto extends OptionalReasonDto {
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

export class EventPatchDto extends OptionalReasonDto {
  @Length(1, 100)
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  deckLimit?: number;
}

export class MatchPatchDto extends OptionalReasonDto {
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

export class RegistrationSettingsDto extends OptionalReasonDto {
  @IsISO8601()
  @IsOptional()
  opensAt!: string | null;

  @IsISO8601()
  @IsOptional()
  cutoffAt!: string | null;

  @IsInt()
  @Min(0)
  limit!: number;
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

  private async reserveGame(gameId: number) {
    const reservation =
      await this.tournaments.tournamentRoomReservation(gameId);
    return this.rooms.reserveTournamentGame(reservation);
  }

  @Get("registration/settings")
  settings() {
    return this.tournaments.registrationSettings();
  }

  @Patch("registration/settings")
  updateSettings(@User() actor: number, @Body() dto: RegistrationSettingsDto) {
    return this.tournaments.registrationSettings(dto, actor);
  }

  @Get("users")
  async users(
    @Query("status") status?: CompetitionStatus,
    @Query("descending") descending?: string,
  ) {
    const users = await this.tournaments.users(status, descending === "true");
    return users.map((user) => ({
      ...user,
      inRunningGame: this.rooms.currentRoom(user.id) !== null,
    }));
  }

  @Get("users/:id/decks")
  userDecks(@Param("id", ParseIntPipe) id: number) {
    return this.decks.getAllDecks(id, { take: 100 });
  }

  @Patch("users/competition-status")
  async statuses(@User() actor: number, @Body() dto: StatusBatchDto) {
    const result = await this.tournaments.setUserStatuses(
      actor,
      dto.userIds,
      dto.status,
      dto.reason,
    );
    if (dto.status !== "PLAYER") {
      for (const item of result.results) {
        if (item.ok && "closedGameIds" in item) {
          for (const gameId of item.closedGameIds) {
            await this.rooms.finalizeAdminTournamentGame(gameId, (snapshot) =>
              this.tournaments.attachAdminStateLog(
                gameId,
                snapshot.stateLog,
                snapshot.roundCount,
              ),
            );
          }
          this.rooms.terminateWaitingTournamentRoomsForUser(item.userId);
        }
      }
    }
    return result;
  }

  @Get("events")
  events() {
    return this.tournaments.listEvents();
  }

  @Post("events")
  async createEvent(@User() actor: number, @Body() dto: CreateEventDto) {
    const event = await this.tournaments.createEvent(actor, dto);
    const gameIds = event.matches.flatMap((match) =>
      match.games
        .filter((game) => game.status === "PENDING")
        .map((game) => game.id),
    );
    await Promise.all(gameIds.map((gameId) => this.reserveGame(gameId)));
    return event;
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
    @Body() dto?: OptionalReasonDto,
  ) {
    const result = await this.tournaments.advanceEvent(actor, id, dto?.reason);
    await Promise.all(
      result.createdGameIds.map((gameId) => this.reserveGame(gameId)),
    );
    if (result.phase === "FINISHED") {
      for (const gameId of result.closedGameIds) {
        await this.rooms.finalizeAdminTournamentGame(gameId, (snapshot) =>
          this.tournaments.attachAdminStateLog(
            gameId,
            snapshot.stateLog,
            snapshot.roundCount,
          ),
        );
      }
    }
    return result;
  }

  @Get("events/:id/export")
  exportEvent(
    @Param("id", ParseIntPipe) id: number,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header(
      "Content-Disposition",
      `attachment; filename="event-${id}-${Date.now()}.json"`,
    );
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
  async createGame(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto?: OptionalReasonDto,
  ) {
    const game = await this.tournaments.createGame(actor, id, dto?.reason);
    if (game) await this.reserveGame(game.id);
    return game;
  }

  @Post("matches/:id/auto-win")
  autoWin(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto?: OptionalReasonDto,
  ) {
    return this.tournaments.autoWin(actor, id, dto?.reason);
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

  @Delete("matches/:id/participants/:userId/decks")
  unassignDeck(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Param("userId", ParseIntPipe) userId: number,
    @Body() dto: AssignDeckDto,
  ) {
    return this.tournaments.unassignDeck(
      actor,
      id,
      userId,
      dto.deckId,
      dto.reason,
    );
  }

  @Patch("games/:id/intervention")
  async gameIntervention(
    @User() actor: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: GameInterventionDto,
  ) {
    const updated = await this.tournaments.interveneGame(actor, id, dto);
    await this.rooms.finalizeAdminTournamentGame(id, (snapshot) =>
      this.tournaments.attachAdminStateLog(
        id,
        snapshot.stateLog,
        snapshot.roundCount,
      ),
    );
    return updated;
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

  private async reserveGame(gameId: number) {
    const reservation =
      await this.tournaments.tournamentRoomReservation(gameId);
    return this.rooms.reserveTournamentGame(reservation);
  }

  @Get(":id/join-options")
  async options(@User() userId: number, @Param("id", ParseIntPipe) id: number) {
    const options = await this.tournaments.joinOptions(id, userId);
    const room = await this.reserveGame(id);
    return { ...options, room };
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
      ensurePending: () => this.tournaments.assertGameJoinable(id, userId),
      markStarted: () => this.tournaments.markGameStarted(id),
      finalize: async (result) => {
        const finalized = await this.tournaments.finalizeGame({
          gameId: id,
          ...result,
        });
        if (finalized.nextGameId !== null) {
          await this.reserveGame(finalized.nextGameId);
        }
        return finalized.game;
      },
    });
  }
}

@Controller("users/me")
export class ParticipantTournamentsController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly rooms: RoomsService,
    private readonly registration: RegistrationService,
  ) {}

  @Delete("registration")
  async withdraw(@User() userId: number) {
    const result = await this.registration.withdraw(userId);
    for (const gameId of result.closedGameIds) {
      await this.rooms.finalizeAdminTournamentGame(gameId, (snapshot) =>
        this.tournaments.attachAdminStateLog(
          gameId,
          snapshot.stateLog,
          snapshot.roundCount,
        ),
      );
    }
    this.rooms.terminateWaitingTournamentRoomsForUser(userId);
    return result;
  }

  @Get("matches")
  async matches(@User() userId: number) {
    const matches = await this.tournaments.activeMatches(userId);
    return matches
      .filter(
        (match) =>
          match.games.filter((game) => game.status === "FINISHED").length <
            match.maxGames ||
          match.participants.filter(
            (participant) => participant.status === "ACTIVE",
          ).length === 1,
      )
      .map((match) => ({
        ...match,
        games: match.games.map((game) => ({
          ...game,
          runtimeStatus: this.rooms.tournamentRuntimeStatus(game.id),
          roomId: this.rooms.tournamentRoomId(game.id),
        })),
      }));
  }
}
