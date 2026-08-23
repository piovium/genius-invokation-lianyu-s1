// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CORE_VERSION, CURRENT_VERSION } from "@gi-tcg/core";
import { Prisma, type GameEndReason } from "#prisma/client";
import { PrismaService } from "../db/prisma.service";
import { BusinessException } from "../errors";
import { ASSETS_MANAGER, MATCH_CONFIG_VERSION } from "../utils";
import { characterKey } from "../decks/decks.service";
import { isPlayerInRunningRoom } from "../rooms/room-runtime";
import type {
  CreateEventDto,
  EventPatchDto,
  GameInterventionDto,
  MatchInterventionDto,
  MatchPatchDto,
  MatchTemplateDto,
  RegistrationSettingsDto,
} from "./tournaments.controller";

type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

const json = (value: unknown) => value as Prisma.InputJsonValue;

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async lock(tx: Tx, matchId: number) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(22002, ${matchId})`;
  }

  private async lockEvent(tx: Tx, eventId: number) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(22003, ${eventId})`;
  }

  private async lockUsers(tx: Tx, userIds: readonly number[]) {
    for (const userId of [...userIds].sort((a, b) => a - b)) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(22001, ${userId})`;
    }
  }

  private audit(
    tx: Tx,
    actorUserId: number,
    action: string,
    targetType: string,
    targetId: number | string,
    reason: string,
    before?: unknown,
    after?: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        actorUserId,
        action,
        targetType,
        targetId: String(targetId),
        reason,
        before: before === undefined ? undefined : json(before),
        after: after === undefined ? undefined : json(after),
      },
    });
  }

  listEvents() {
    return this.prisma.tournamentEvent.findMany({
      include: { _count: { select: { matches: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  event(id: number) {
    return this.prisma.tournamentEvent.findUnique({
      where: { id },
      include: {
        matches: {
          include: {
            participants: {
              include: { user: { select: { id: true, qq: true, name: true } } },
              orderBy: { who: "asc" },
            },
            matchDecks: true,
            games: { include: { players: true }, orderBy: { id: "asc" } },
          },
          orderBy: { id: "asc" },
        },
      },
    });
  }

  async createEvent(actorUserId: number, dto: CreateEventDto) {
    if (dto.event.initialPhase === "FINISHED") {
      throw new ConflictException("Cannot create an already-finished event");
    }
    const ids = [...dto.player0Ids, ...dto.player1Ids];
    if (new Set(ids).size !== ids.length) {
      throw new ConflictException("Duplicate player in event request");
    }
    if (ids.length === 0) throw new ConflictException("No players selected");
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, ids);
      const users = await tx.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, competitionStatus: true, activeMatchId: true },
      });
      const conflicts = ids.filter((id) => {
        const user = users.find((item) => item.id === id);
        return (
          !user || user.competitionStatus !== "PLAYER" || user.activeMatchId
        );
      });
      if (conflicts.length) {
        throw new BusinessException(
          "USER_ALREADY_IN_ACTIVE_EVENT",
          "部分选手不可加入该场次",
          409,
          { userIds: conflicts },
        );
      }
      const event = await tx.tournamentEvent.create({
        data: {
          name: dto.event.name,
          phase: dto.event.initialPhase,
          deckLimit: dto.event.deckLimit,
        },
      });
      const length = Math.max(dto.player0Ids.length, dto.player1Ids.length);
      const matchIds: number[] = [];
      for (let index = 0; index < length; index++) {
        const participants = [dto.player0Ids[index], dto.player1Ids[index]]
          .map((userId, who) => (userId ? { userId, who } : null))
          .filter((value): value is { userId: number; who: number } => !!value);
        const match = await tx.tournamentMatch.create({
          data: {
            eventId: event.id,
            ...this.templateData(dto.matchTemplate),
            participants: { create: participants },
          },
        });
        matchIds.push(match.id);
        await Promise.all(
          participants.map(({ userId }) =>
            tx.user.update({
              where: { id: userId },
              data: { activeMatchId: match.id },
            }),
          ),
        );
      }
      await this.audit(
        tx,
        actorUserId,
        "EVENT_CREATE",
        "TournamentEvent",
        event.id,
        dto.reason,
        undefined,
        { ...event, matchIds },
      );
      if (event.phase === "RUNNING") {
        for (const matchId of matchIds)
          await this.createNextGameTx(tx, matchId, true);
      }
      return tx.tournamentEvent.findUnique({
        where: { id: event.id },
        include: {
          matches: {
            include: {
              participants: {
                include: {
                  user: { select: { id: true, qq: true, name: true } },
                },
                orderBy: { who: "asc" },
              },
              matchDecks: true,
              games: { include: { players: true }, orderBy: { id: "asc" } },
            },
            orderBy: { id: "asc" },
          },
        },
      });
    });
  }

  private templateData(template: MatchTemplateDto) {
    if (template.maxGames < template.winsRequired) {
      throw new ConflictException("maxGames must be >= winsRequired");
    }
    return {
      scheduledStart: template.scheduledStart
        ? new Date(template.scheduledStart)
        : null,
      scheduledEnd: template.scheduledEnd
        ? new Date(template.scheduledEnd)
        : null,
      mode: template.mode,
      maxGames: template.maxGames,
      winsRequired: template.winsRequired,
      autoCreateGame: template.autoCreateGame,
      roomConfig: json(template.roomConfig ?? {}),
    };
  }

  async patchEvent(actorUserId: number, id: number, dto: EventPatchDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockEvent(tx, id);
      const before = await tx.tournamentEvent.findUniqueOrThrow({
        where: { id },
      });
      if (before.phase === "FINISHED")
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      if (before.phase === "RUNNING" && dto.deckLimit !== undefined) {
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      }
      const after = await tx.tournamentEvent.update({
        where: { id },
        data: { name: dto.name, deckLimit: dto.deckLimit },
      });
      await this.audit(
        tx,
        actorUserId,
        "EVENT_UPDATE",
        "TournamentEvent",
        id,
        dto.reason,
        before,
        after,
      );
      return after;
    });
  }

  async advanceEvent(actorUserId: number, id: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockEvent(tx, id);
      const event = await tx.tournamentEvent.findUniqueOrThrow({
        where: { id },
        include: { matches: true },
      });
      for (const match of [...event.matches].sort((a, b) => a.id - b.id)) {
        await this.lock(tx, match.id);
      }
      if (event.phase === "FINISHED")
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      const next = event.phase === "DECK_COLLECTION" ? "RUNNING" : "FINISHED";
      let closedGameIds: number[] = [];
      if (next === "RUNNING") {
        const selectedDecks = await tx.matchDeck.findMany({
          where: { match: { eventId: id } },
          include: { sourceDeck: true },
        });
        const frozenAt = new Date();
        for (const selected of selectedDecks) {
          const source = selected.sourceDeck;
          if (!source) {
            throw new ConflictException("COMPETITION_DECK_SOURCE_MISSING");
          }
          const decoded = ASSETS_MANAGER.decode(source.code);
          await tx.matchDeck.update({
            where: { id: selected.id },
            data: {
              name: source.name,
              code: source.code,
              requiredVersion: source.requiredVersion,
              deckJson: json(decoded),
              characterKey: characterKey(decoded.characters),
              frozenAt,
            },
          });
        }
        await tx.tournamentEvent.update({
          where: { id },
          data: { phase: next },
        });
        for (const match of event.matches) {
          if (match.autoCreateGame)
            await this.createNextGameTx(tx, match.id, true);
        }
      } else {
        closedGameIds = (
          await tx.game.findMany({
            where: { match: { eventId: id }, status: "PENDING" },
            select: { id: true },
          })
        ).map((game) => game.id);
        await tx.game.updateMany({
          where: { match: { eventId: id }, status: "PENDING" },
          data: {
            status: "FINISHED",
            endReason: "ADMIN",
            countForStats: false,
            finishedAt: new Date(),
          },
        });
        await tx.tournamentMatch.updateMany({
          where: { eventId: id },
          data: { autoCreateGame: false },
        });
        await tx.user.updateMany({
          where: { activeMatch: { eventId: id } },
          data: { activeMatchId: null },
        });
        await tx.tournamentEvent.update({
          where: { id },
          data: { phase: next },
        });
      }
      await this.audit(
        tx,
        actorUserId,
        "EVENT_ADVANCE",
        "TournamentEvent",
        id,
        reason,
        { phase: event.phase },
        { phase: next },
      );
      return { id, phase: next, closedGameIds };
    });
  }

  match(id: number) {
    return this.prisma.tournamentMatch.findUnique({
      where: { id },
      include: {
        event: true,
        participants: {
          include: {
            user: { select: { id: true, qq: true, name: true } },
          },
          orderBy: { who: "asc" },
        },
        matchDecks: true,
        games: { include: { players: true }, orderBy: { id: "asc" } },
      },
    });
  }

  async patchMatch(actorUserId: number, id: number, dto: MatchPatchDto) {
    const current = await this.prisma.tournamentMatch.findUniqueOrThrow({
      where: { id },
      select: { eventId: true },
    });
    return this.prisma.$transaction(async (tx) => {
      await this.lockEvent(tx, current.eventId);
      await this.lock(tx, id);
      const before = await tx.tournamentMatch.findUniqueOrThrow({
        where: { id },
        include: { event: true },
      });
      if (before.event.phase === "FINISHED")
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      if (
        before.event.phase === "RUNNING" &&
        (dto.mode || dto.maxGames || dto.winsRequired || dto.roomConfig)
      ) {
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      }
      const after = await tx.tournamentMatch.update({
        where: { id },
        data: {
          scheduledStart: dto.scheduledStart
            ? new Date(dto.scheduledStart)
            : undefined,
          scheduledEnd: dto.scheduledEnd
            ? new Date(dto.scheduledEnd)
            : undefined,
          mode: dto.mode,
          maxGames: dto.maxGames,
          winsRequired: dto.winsRequired,
          roomConfig: dto.roomConfig ? json(dto.roomConfig) : undefined,
          autoCreateGame: dto.autoCreateGame,
        },
      });
      await this.audit(
        tx,
        actorUserId,
        "MATCH_UPDATE",
        "TournamentMatch",
        id,
        dto.reason,
        before,
        after,
      );
      return after;
    });
  }

  createGame(actorUserId: number, matchId: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, matchId);
      const game = await this.createNextGameTx(tx, matchId, false);
      await this.audit(
        tx,
        actorUserId,
        "GAME_CREATE",
        "TournamentMatch",
        matchId,
        reason,
        undefined,
        game,
      );
      return game;
    });
  }

  private async createNextGameTx(tx: Tx, matchId: number, automatic: boolean) {
    await this.lock(tx, matchId);
    const match = await tx.tournamentMatch.findUniqueOrThrow({
      where: { id: matchId },
      include: {
        event: true,
        participants: { where: { status: "ACTIVE" }, orderBy: { who: "asc" } },
        games: { select: { id: true, status: true } },
      },
    });
    if (match.event.phase !== "RUNNING")
      throw new ConflictException("EVENT_PHASE_MISMATCH");
    if (automatic && !match.autoCreateGame) return null;
    if (match.winnerUserId || match.games.length >= match.maxGames) {
      throw new ConflictException("MATCH_COMPLETED");
    }
    if (match.participants.length !== 2) {
      throw new ConflictException("MATCH_REQUIRES_TWO_PLAYERS");
    }
    const open = match.games.find(({ status }) => status === "PENDING");
    if (open) {
      if (automatic) return open;
      throw new BusinessException(
        "MATCH_ALREADY_HAS_OPEN_GAME",
        "该盘已有开放对局",
        409,
        { gameId: open.id },
      );
    }
    const participants =
      Math.random() < 0.5
        ? match.participants
        : [match.participants[1]!, match.participants[0]!];
    return tx.game.create({
      data: {
        matchId,
        coreVersion: CORE_VERSION,
        gameVersion: MATCH_CONFIG_VERSION || CURRENT_VERSION,
        players: {
          create: participants.map((participant, who) => ({
            who,
            userId: participant.userId,
          })),
        },
      },
      include: { players: true },
    });
  }

  async joinOptions(gameId: number, userId: number) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        match: { include: { event: true } },
        players: true,
      },
    });
    if (!game?.match || game.status !== "PENDING")
      throw new NotFoundException();
    const player = game.players.find((item) => item.userId === userId);
    if (!player) throw new NotFoundException();
    const participant = await this.prisma.matchParticipant.findUnique({
      where: { matchId_userId: { matchId: game.matchId!, userId } },
      select: { status: true },
    });
    if (participant?.status !== "ACTIVE") throw new NotFoundException();
    const decks =
      game.match.mode === "UNRESTRICTED"
        ? await this.prisma.deck.findMany({ where: { ownerUserId: userId } })
        : await this.prisma.matchDeck.findMany({
            where: { matchId: game.matchId!, userId },
          });
    return {
      gameId,
      who: player.who,
      mode: game.match.mode,
      roomConfig: game.match.roomConfig,
      decks,
    };
  }

  async chooseDeck(gameId: number, userId: number, deckId: number) {
    const current = await this.prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      select: { matchId: true },
    });
    if (!current.matchId) throw new ConflictException("Not a tournament game");
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, current.matchId!);
      const game = await tx.game.findUniqueOrThrow({
        where: { id: gameId },
        include: { match: true, players: true },
      });
      if (!game.match || game.status !== "PENDING")
        throw new ConflictException("MATCH_COMPLETED");
      const player = game.players.find((item) => item.userId === userId);
      if (!player) throw new NotFoundException();
      const participant = await tx.matchParticipant.findUnique({
        where: { matchId_userId: { matchId: game.matchId!, userId } },
        select: { status: true },
      });
      if (participant?.status !== "ACTIVE") throw new NotFoundException();
      let snapshot: {
        id: number;
        name: string;
        code: string;
        deckJson: unknown;
        characterKey: string;
        sourceDeckId: number | null;
      };
      if (game.match.mode === "UNRESTRICTED") {
        const deck = await tx.deck.findFirstOrThrow({
          where: { id: deckId, ownerUserId: userId },
        });
        const decoded = ASSETS_MANAGER.decode(deck.code);
        snapshot = {
          id: 0,
          name: deck.name,
          code: deck.code,
          deckJson: decoded,
          characterKey: characterKey(decoded.characters),
          sourceDeckId: deck.id,
        };
      } else {
        const matchDeck = await tx.matchDeck.findFirst({
          where: {
            OR: [{ id: deckId }, { sourceDeckId: deckId }],
            matchId: game.matchId!,
            userId,
            usable: true,
          },
        });
        if (!matchDeck)
          throw new BusinessException(
            "NO_USABLE_COMPETITION_DECK",
            "该牌组不可用于本局",
            409,
          );
        snapshot = matchDeck;
      }
      const selectedDeckId = snapshot.sourceDeckId;
      const selectedMatchDeckId = snapshot.id || null;
      if (player.deckJson !== null) {
        if (
          player.deckId === selectedDeckId &&
          player.matchDeckId === selectedMatchDeckId
        ) {
          return { gameId, who: player.who, ready: true };
        }
        throw new BusinessException(
          "TOURNAMENT_DECK_ALREADY_SELECTED",
          "本局牌组已经锁定",
          409,
        );
      }
      await tx.gamePlayer.update({
        where: { gameId_who: { gameId, who: player.who } },
        data: {
          deckId: selectedDeckId,
          matchDeckId: selectedMatchDeckId,
          deckName: snapshot.name,
          deckJson: json(snapshot.deckJson),
          characterKey: snapshot.characterKey,
        },
      });
      return { gameId, who: player.who, ready: true };
    });
  }

  async markGameStarted(gameId: number) {
    const current = await this.prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      select: { matchId: true },
    });
    if (!current.matchId) throw new ConflictException("Not a tournament game");
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, current.matchId!);
      const game = await tx.game.findUniqueOrThrow({
        where: { id: gameId },
        include: { players: true },
      });
      if (game.status !== "PENDING") {
        throw new ConflictException("MATCH_COMPLETED");
      }
      if (
        game.players.length !== 2 ||
        game.players.some((player) => player.deckJson === null)
      ) {
        throw new ConflictException("TOURNAMENT_DECK_NOT_SELECTED");
      }
      return tx.game.update({
        where: { id: gameId },
        data: { startedAt: game.startedAt ?? new Date() },
      });
    });
  }

  async tournamentRoomData(gameId: number, userId: number) {
    const game = await this.prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      include: {
        match: true,
        players: {
          include: { user: { select: { id: true, name: true, qq: true } } },
          orderBy: { who: "asc" },
        },
      },
    });
    if (!game.match || game.status !== "PENDING") {
      throw new ConflictException("MATCH_COMPLETED");
    }
    const player = game.players.find((item) => item.userId === userId);
    if (!player?.deckJson || !player.user) {
      throw new ConflictException("TOURNAMENT_DECK_NOT_SELECTED");
    }
    if (
      game.players.length !== 2 ||
      game.players.some((item) => item.userId === null)
    ) {
      throw new ConflictException("MATCH_REQUIRES_TWO_PLAYERS");
    }
    const participant = await this.prisma.matchParticipant.findUnique({
      where: { matchId_userId: { matchId: game.matchId!, userId } },
      select: { status: true },
    });
    if (participant?.status !== "ACTIVE") throw new NotFoundException();
    return {
      gameId,
      userId,
      who: player.who as 0 | 1,
      playerName: player.user.name,
      avatarUrl: `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(player.user.qq)}&s=640`,
      deckId: player.deckId,
      deck: player.deckJson as unknown as {
        characters: number[];
        cards: number[];
      },
      expectedUserIds: game.players.map((item) => item.userId) as [
        number,
        number,
      ],
      roomConfig: game.match.roomConfig as Record<string, unknown>,
    };
  }

  async assertGameJoinable(gameId: number, userId: number) {
    const current = await this.prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      select: { matchId: true },
    });
    if (!current.matchId) throw new ConflictException("Not a tournament game");
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, current.matchId!);
      const game = await tx.game.findUniqueOrThrow({
        where: { id: gameId },
        include: { players: true },
      });
      if (game.status !== "PENDING") {
        throw new ConflictException("MATCH_COMPLETED");
      }
      if (!game.players.some((player) => player.userId === userId)) {
        throw new NotFoundException();
      }
      const participant = await tx.matchParticipant.findUnique({
        where: { matchId_userId: { matchId: current.matchId!, userId } },
        select: { status: true },
      });
      if (participant?.status !== "ACTIVE") throw new NotFoundException();
    });
  }

  async finalizeGame(input: {
    gameId: number;
    winnerWho: number | null;
    roundCount: number | null;
    endReason: GameEndReason;
    stateLog: unknown;
    countForStats?: boolean;
  }) {
    const existing = await this.prisma.game.findUniqueOrThrow({
      where: { id: input.gameId },
    });
    if (!existing.matchId) throw new ConflictException("Not a tournament game");
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, existing.matchId!);
      const game = await tx.game.findUniqueOrThrow({
        where: { id: input.gameId },
        include: { players: true, match: true },
      });
      if (game.status === "FINISHED" && game.endReason === "ADMIN") {
        return tx.game.update({
          where: { id: game.id },
          data: {
            stateLog: json(input.stateLog),
            roundCount: input.roundCount,
          },
        });
      }
      const updated = await tx.game.update({
        where: { id: game.id },
        data: {
          status: "FINISHED",
          winnerWho: input.winnerWho,
          roundCount: input.roundCount,
          endReason: input.endReason,
          stateLog: json(input.stateLog),
          countForStats:
            input.countForStats ?? input.endReason !== "ENGINE_ERROR",
          finishedAt: new Date(),
        },
      });
      if (input.endReason !== "ENGINE_ERROR") {
        await this.exhaustDecks(tx, game, input.winnerWho);
      }
      await this.settleMatch(tx, existing.matchId!);
      return updated;
    });
  }

  private async exhaustDecks(
    tx: Tx,
    game: Awaited<ReturnType<Tx["game"]["findUniqueOrThrow"]>> & {
      players: {
        matchDeckId: number | null;
        userId: number | null;
        characterKey: string | null;
      }[];
      match: { mode: string } | null;
    },
    winnerWho: number | null,
  ) {
    const targets =
      game.match?.mode === "DUEL"
        ? game.players
        : game.match?.mode === "CONQUEST" && winnerWho !== null
          ? game.players.filter((player: any) => player.who === winnerWho)
          : [];
    for (const target of targets) {
      if (!target.userId || !target.characterKey) continue;
      await tx.matchDeck.updateMany({
        where: {
          matchId: game.matchId!,
          userId: target.userId,
          characterKey: target.characterKey,
        },
        data: {
          usable: false,
          disableReason:
            game.match?.mode === "DUEL" ? "DUEL_USED" : "CONQUEST_WINNER_USED",
        },
      });
    }
  }

  private async settleMatch(tx: Tx, matchId: number) {
    const match = await tx.tournamentMatch.findUniqueOrThrow({
      where: { id: matchId },
      include: {
        games: { where: { status: "FINISHED" }, include: { players: true } },
      },
    });
    const wins = new Map<number, number>();
    for (const game of match.games) {
      const who = game.manualWinnerWho ?? game.winnerWho;
      const userId = game.players.find((player) => player.who === who)?.userId;
      if (userId) wins.set(userId, (wins.get(userId) ?? 0) + 1);
    }
    const winner = [...wins].find(
      ([, count]) => count >= match.winsRequired,
    )?.[0];
    if (winner) {
      await tx.tournamentMatch.update({
        where: { id: matchId },
        data: { winnerUserId: winner, autoCreateGame: false },
      });
      return;
    }
    if (match.games.length >= match.maxGames) {
      await tx.tournamentMatch.update({
        where: { id: matchId },
        data: { autoCreateGame: false },
      });
      return;
    }
    if (match.games.length < match.maxGames && match.autoCreateGame) {
      await this.createNextGameTx(tx, matchId, true);
    }
  }

  async autoWin(actorUserId: number, matchId: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, matchId);
      const match = await tx.tournamentMatch.findUniqueOrThrow({
        where: { id: matchId },
        include: {
          event: true,
          participants: { where: { status: "ACTIVE" } },
          games: { select: { status: true } },
        },
      });
      if (match.event.phase !== "RUNNING")
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      if (
        match.winnerUserId !== null ||
        match.games.some((game) => game.status === "PENDING")
      ) {
        throw new ConflictException("MATCH_COMPLETED");
      }
      if (match.participants.length !== 1)
        throw new ConflictException("MATCH_NOT_A_BYE");
      const before = { winnerUserId: match.winnerUserId };
      const after = await tx.tournamentMatch.update({
        where: { id: matchId },
        data: {
          winnerUserId: match.participants[0]!.userId,
          autoCreateGame: false,
        },
      });
      await this.audit(
        tx,
        actorUserId,
        "MATCH_AUTO_WIN",
        "TournamentMatch",
        matchId,
        reason,
        before,
        after,
      );
      return after;
    });
  }

  async interveneMatch(
    actorUserId: number,
    matchId: number,
    dto: MatchInterventionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, matchId);
      const before = await tx.tournamentMatch.findUniqueOrThrow({
        where: { id: matchId },
      });
      if (dto.winnerUserId !== null) {
        const participant = await tx.matchParticipant.findUnique({
          where: { matchId_userId: { matchId, userId: dto.winnerUserId } },
        });
        if (!participant)
          throw new NotFoundException("Winner is not a participant");
      }
      const after = await tx.tournamentMatch.update({
        where: { id: matchId },
        data: { winnerUserId: dto.winnerUserId, autoCreateGame: false },
      });
      await this.audit(
        tx,
        actorUserId,
        "MATCH_INTERVENTION",
        "TournamentMatch",
        matchId,
        dto.reason,
        before,
        after,
      );
      return after;
    });
  }

  async interveneGame(
    actorUserId: number,
    gameId: number,
    dto: GameInterventionDto,
  ) {
    const current = await this.prisma.game.findUniqueOrThrow({
      where: { id: gameId },
    });
    if (!current.matchId) throw new ConflictException("Not a tournament game");
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, current.matchId!);
      const before = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
      if (dto.status === "PENDING") {
        const other = await tx.game.findFirst({
          where: {
            matchId: current.matchId,
            status: "PENDING",
            id: { not: gameId },
          },
        });
        if (other) throw new ConflictException("MATCH_ALREADY_HAS_OPEN_GAME");
      }
      await tx.tournamentMatch.update({
        where: { id: current.matchId! },
        data: { autoCreateGame: false },
      });
      const after = await tx.game.update({
        where: { id: gameId },
        data: {
          status: dto.status,
          manualWinnerWho: dto.manualWinnerWho,
          countForStats: dto.countForStats,
          endReason: dto.status === "FINISHED" ? "ADMIN" : null,
          roundCount: dto.status === "PENDING" ? null : undefined,
          finishedAt: dto.status === "FINISHED" ? new Date() : null,
        },
      });
      await this.audit(
        tx,
        actorUserId,
        "GAME_INTERVENTION",
        "Game",
        gameId,
        dto.reason,
        before,
        after,
      );
      return after;
    });
  }

  async attachAdminStateLog(
    gameId: number,
    stateLog: unknown,
    roundCount: number | null,
  ) {
    return this.prisma.game.updateMany({
      where: { id: gameId, endReason: "ADMIN" },
      data: { stateLog: json(stateLog), roundCount },
    });
  }

  async assignDeck(
    actorUserId: number,
    matchId: number,
    userId: number,
    deckId: number,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, matchId);
      const match = await tx.tournamentMatch.findUniqueOrThrow({
        where: { id: matchId },
        include: { event: true },
      });
      if (match.event.phase === "FINISHED")
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      const participant = await tx.matchParticipant.findUnique({
        where: { matchId_userId: { matchId, userId } },
      });
      if (!participant) throw new NotFoundException();
      const deck = await tx.deck.findFirstOrThrow({
        where: { id: deckId, ownerUserId: userId },
      });
      const decoded = ASSETS_MANAGER.decode(deck.code);
      const key = characterKey(decoded.characters);
      const count = await tx.matchDeck.count({ where: { matchId, userId } });
      if (match.event.deckLimit > 0 && count >= match.event.deckLimit)
        throw new ConflictException("COMPETITION_DECK_LIMIT_REACHED");
      const duplicate = await tx.matchDeck.findFirst({
        where: { matchId, userId, characterKey: key },
      });
      if (duplicate) throw new ConflictException("DUPLICATE_CHARACTER_SET");
      const created = await tx.matchDeck.create({
        data: {
          matchId,
          userId,
          sourceDeckId: deck.id,
          name: deck.name,
          code: deck.code,
          requiredVersion: deck.requiredVersion,
          deckJson: json(decoded),
          characterKey: key,
          frozenAt: match.event.phase === "RUNNING" ? new Date() : null,
        },
      });
      await this.audit(
        tx,
        actorUserId,
        "MATCH_DECK_ASSIGN",
        "MatchDeck",
        created.id,
        reason,
        undefined,
        created,
      );
      return created;
    });
  }

  activeMatches(userId: number) {
    return this.prisma.tournamentMatch.findMany({
      where: {
        event: { phase: { in: ["DECK_COLLECTION", "RUNNING"] } },
        winnerUserId: null,
        participants: { some: { userId, status: "ACTIVE" } },
      },
      include: {
        event: true,
        participants: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { who: "asc" },
        },
        games: {
          include: {
            players: {
              select: { gameId: true, who: true, userId: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        matchDecks: { where: { userId } },
      },
      orderBy: { scheduledStart: "desc" },
    });
  }

  async exportEvent(id: number) {
    const event = await this.event(id);
    if (!event) throw new NotFoundException();
    return {
      ...event,
      matches: event.matches.map((match) => ({
        ...match,
        games: match.games.map(({ stateLog: _stateLog, ...game }) => game),
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  async registrationSettings(
    dto?: RegistrationSettingsDto,
    actorUserId?: number,
  ) {
    if (!dto) {
      return this.prisma.registrationSetting.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
      });
    }
    const opensAt = dto.opensAt ? new Date(dto.opensAt) : null;
    const cutoffAt = dto.cutoffAt ? new Date(dto.cutoffAt) : null;
    if (opensAt && cutoffAt && opensAt.getTime() >= cutoffAt.getTime()) {
      throw new BusinessException(
        "INVALID_REGISTRATION_WINDOW",
        "报名开始时间必须早于报名截止时间",
        400,
      );
    }
    if (actorUserId === undefined) {
      throw new Error("Actor is required to update registration settings");
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(22004, 1)`;
      const before = await tx.registrationSetting.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
      });
      const after = await tx.registrationSetting.update({
        where: { id: 1 },
        data: { opensAt, cutoffAt, limit: dto.limit },
      });
      await this.audit(
        tx,
        actorUserId,
        "REGISTRATION_SETTINGS_UPDATE",
        "RegistrationSetting",
        1,
        dto.reason,
        before,
        after,
      );
      return after;
    });
  }

  users(status?: "NONE" | "REGISTERED" | "PLAYER", descending = false) {
    return this.prisma.user.findMany({
      where: status ? { competitionStatus: status } : undefined,
      select: {
        id: true,
        qq: true,
        name: true,
        role: true,
        competitionStatus: true,
        appliedAt: true,
        activeMatchId: true,
        createdAt: true,
      },
      orderBy: [{ appliedAt: descending ? "desc" : "asc" }, { id: "asc" }],
    });
  }

  async setUserStatuses(
    actorUserId: number,
    userIds: number[],
    status: "NONE" | "REGISTERED" | "PLAYER",
    reason: string,
  ) {
    const results = [];
    for (const userId of userIds) {
      try {
        if (status !== "PLAYER" && isPlayerInRunningRoom(userId)) {
          throw new BusinessException(
            "USER_IN_RUNNING_GAME",
            "用户仍在进行中的对局里",
            409,
          );
        }
        const result = await this.prisma.$transaction(async (tx) => {
          await this.lockUsers(tx, [userId]);
          const before = await tx.user.findUniqueOrThrow({
            where: { id: userId },
          });
          let closedGameIds: number[] = [];
          if (status !== "PLAYER" && before.activeMatchId) {
            await this.lock(tx, before.activeMatchId);
            if (isPlayerInRunningRoom(userId)) {
              throw new BusinessException(
                "USER_IN_RUNNING_GAME",
                "用户仍在进行中的对局里",
                409,
              );
            }
            await tx.matchParticipant.updateMany({
              where: { matchId: before.activeMatchId, userId },
              data: { status: "WITHDRAWN" },
            });
            closedGameIds = (
              await tx.game.findMany({
                where: { matchId: before.activeMatchId, status: "PENDING" },
                select: { id: true },
              })
            ).map((game) => game.id);
            await tx.game.updateMany({
              where: { matchId: before.activeMatchId, status: "PENDING" },
              data: {
                status: "FINISHED",
                endReason: "ADMIN",
                countForStats: false,
                finishedAt: new Date(),
              },
            });
            await tx.tournamentMatch.update({
              where: { id: before.activeMatchId },
              data: { autoCreateGame: false },
            });
          }
          const after = await tx.user.update({
            where: { id: userId },
            data: {
              competitionStatus: status,
              appliedAt:
                status === "NONE" ? null : (before.appliedAt ?? new Date()),
              activeMatchId: status === "PLAYER" ? undefined : null,
            },
          });
          await this.audit(
            tx,
            actorUserId,
            "USER_COMPETITION_STATUS",
            "User",
            userId,
            reason,
            {
              competitionStatus: before.competitionStatus,
              appliedAt: before.appliedAt,
              activeMatchId: before.activeMatchId,
            },
            {
              competitionStatus: after.competitionStatus,
              appliedAt: after.appliedAt,
              activeMatchId: after.activeMatchId,
            },
          );
          return { user: after, closedGameIds };
        });
        results.push({ userId, ok: true, ...result });
      } catch (error) {
        results.push({
          userId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { results };
  }

  auditLogs(skip = 0, take = 30) {
    return this.prisma.auditLog.findMany({
      skip,
      take,
      include: { actor: { select: { id: true, qq: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
}
