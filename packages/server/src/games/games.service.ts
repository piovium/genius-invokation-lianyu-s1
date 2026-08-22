// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, type Game as GameModel } from "#prisma/client";
import type { Deck } from "@gi-tcg/typings";
import { PrismaService } from "../db/prisma.service";
import type { PaginationDto, PaginationResult } from "../utils";
import { MetricsService } from "../metrics/metrics.service";
import { characterKey } from "../decks/decks.service";

export interface AddGameOption {
  players: {
    userId: number | null;
    deckId: number | null;
    name: string;
    deck: Deck;
  }[];
  coreVersion: string;
  gameVersion: string;
  stateLog: unknown;
  winnerWho: number | null;
  endReason?: "NORMAL" | "ENGINE_ERROR" | "SURRENDER";
  countForStats?: boolean;
  startedAt?: Date | null;
  finishedAt?: Date;
}

interface GameNoLog extends Omit<GameModel, "stateLog"> {}

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async addGame(input: AddGameOption): Promise<GameModel> {
    const game = await this.prisma.game.create({
      data: {
        status: "FINISHED",
        coreVersion: input.coreVersion,
        gameVersion: input.gameVersion,
        stateLog: input.stateLog as Prisma.InputJsonValue,
        winnerWho: input.winnerWho,
        endReason: input.endReason ?? "NORMAL",
        countForStats:
          input.countForStats ?? input.endReason !== "ENGINE_ERROR",
        startedAt: input.startedAt,
        finishedAt: input.finishedAt ?? new Date(),
        players: {
          create: input.players.map((player, who) => ({
            who,
            userId: player.userId,
            deckId: player.deckId,
            deckName: player.name,
            deckJson: player.deck as unknown as Prisma.InputJsonValue,
            characterKey: characterKey(player.deck.characters),
          })),
        },
      },
    });
    this.metrics.incrementStoredGames();
    return game;
  }

  async getAllGames({
    skip = 0,
    take = 10,
  }: PaginationDto): Promise<PaginationResult<GameNoLog>> {
    const [data, count] = await this.prisma.game.findManyAndCount({
      skip,
      take,
      where: { status: "FINISHED" },
      omit: { stateLog: true },
      include: {
        players: {
          select: {
            user: { select: { id: true, name: true } },
            who: true,
            deckName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return { count, data };
  }

  async getGame(gameId: number, viewerUserId: number) {
    const [game, viewer] = await Promise.all([
      this.prisma.game.findUnique({
        where: { id: gameId },
        include: {
          players: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: viewerUserId },
        select: { role: true },
      }),
    ]);
    if (
      game &&
      viewer?.role !== "ADMIN" &&
      (game.status !== "FINISHED" ||
        !game.players.some((player) => player.userId === viewerUserId))
    ) {
      throw new ForbiddenException(
        "Only participants and administrators can read state logs",
      );
    }
    return game;
  }

  async gamesHasUser(userId: number, { skip = 0, take = 10 }: PaginationDto) {
    const [data, count] = await this.prisma.gamePlayer.findManyAndCount({
      skip,
      take,
      where: { userId, game: { status: "FINISHED" } },
      include: { game: { omit: { stateLog: true } } },
      orderBy: { game: { createdAt: "desc" } },
    });
    return { data, count };
  }
}
