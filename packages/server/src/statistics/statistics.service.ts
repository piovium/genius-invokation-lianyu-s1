// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "#prisma/client";
import { PrismaService } from "../db/prisma.service";
import { characterKey } from "../decks/decks.service";

export interface StatisticsFilters {
  createdAtFrom?: string;
  createdAtTo?: string;
  sources: ("tournament" | "casual")[];
  eventIds?: number[];
  roundCounts?: number[];
  includeSurrender: boolean;
  includeAdmin: boolean;
}

interface DeckSnapshot {
  characters: number[];
  cards: number[];
}

interface Aggregate {
  appearances: number;
  wins: number;
  awayAppearances?: number;
  awayWins?: number;
}

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  private date(value: string, end: boolean) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    if (end) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }

  private async samples(filters: StatisticsFilters) {
    const createdAt = {
      ...(filters.createdAtFrom
        ? { gte: this.date(filters.createdAtFrom, false) }
        : {}),
      ...(filters.createdAtTo
        ? { lt: this.date(filters.createdAtTo, true) }
        : {}),
    };
    if (createdAt.gte && createdAt.lt && createdAt.gte >= createdAt.lt) {
      throw new BadRequestException(
        "createdAtFrom must not be after createdAtTo",
      );
    }

    const sources: Prisma.GameWhereInput[] = [];
    if (filters.sources.includes("casual")) sources.push({ matchId: null });
    if (filters.eventIds?.length) {
      sources.push({ match: { eventId: { in: filters.eventIds } } });
    } else if (filters.sources.includes("tournament")) {
      sources.push({ matchId: { not: null } });
    }
    const endings: Prisma.GameWhereInput[] = [
      {
        endReason: "NORMAL",
        ...(filters.roundCounts?.length
          ? { roundCount: { in: filters.roundCounts } }
          : {}),
      },
    ];
    if (filters.includeSurrender) endings.push({ endReason: "SURRENDER" });
    if (filters.includeAdmin) endings.push({ endReason: "ADMIN" });

    const games = await this.prisma.game.findMany({
      where: {
        status: "FINISHED",
        countForStats: true,
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        AND: [{ OR: sources }, { OR: endings }],
      },
      select: {
        winnerWho: true,
        manualWinnerWho: true,
        endReason: true,
        createdAt: true,
        players: {
          select: {
            who: true,
            userId: true,
            deckJson: true,
            characterKey: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return games
      .filter(
        (game) =>
          game.players.length === 2 &&
          game.players.every((player) => {
            const deck = player.deckJson as unknown as DeckSnapshot | null;
            return (
              Array.isArray(deck?.characters) && Array.isArray(deck?.cards)
            );
          }),
      )
      .map((game) => ({
        ...game,
        winnerWho:
          game.endReason === "ADMIN"
            ? (game.manualWinnerWho ?? game.winnerWho)
            : game.winnerWho,
      }));
  }

  async cards(filters: StatisticsFilters) {
    const games = await this.samples(filters);
    const characters = new Map<string, Aggregate>();
    const actionCards = new Map<string, Aggregate>();
    const combinations = new Map<string, Aggregate>();
    const touch = (map: Map<string, Aggregate>, id: string, win: boolean) => {
      const item = map.get(id) ?? { appearances: 0, wins: 0 };
      item.appearances++;
      if (win) item.wins++;
      map.set(id, item);
    };
    for (const game of games) {
      const keys = game.players.map((player) => player.characterKey!);
      for (const player of game.players) {
        const deck = player.deckJson as unknown as DeckSnapshot;
        const win = game.winnerWho === player.who;
        for (const id of new Set(deck.characters))
          touch(characters, String(id), win);
        for (const id of new Set(deck.cards))
          touch(actionCards, String(id), win);
        const key = player.characterKey ?? characterKey(deck.characters);
        touch(combinations, key, win);
        if (keys[0] !== keys[1]) {
          const item = combinations.get(key)!;
          item.awayAppearances = (item.awayAppearances ?? 0) + 1;
          if (win) item.awayWins = (item.awayWins ?? 0) + 1;
        }
      }
    }
    const denominator = games.length * 2;
    const serialize = (map: Map<string, Aggregate>) =>
      [...map.entries()]
        .map(([id, item]) => ({
          id,
          ...item,
          appearanceRate: denominator ? item.appearances / denominator : 0,
          winRate: item.appearances ? item.wins / item.appearances : 0,
          awayWinRate: item.awayAppearances
            ? (item.awayWins ?? 0) / item.awayAppearances
            : 0,
        }))
        .sort(
          (a, b) => b.appearances - a.appearances || a.id.localeCompare(b.id),
        );
    return {
      gameCount: games.length,
      denominator,
      characters: serialize(characters),
      actionCards: serialize(actionCards),
      combinations: serialize(combinations),
    };
  }

  async users(filters: StatisticsFilters) {
    const games = await this.samples(filters);
    const users = new Map<
      number,
      {
        games: number;
        wins: number;
        decks: Map<
          string,
          {
            deck: DeckSnapshot;
            uses: number;
            firstUsedAt: Date;
            lastUsedAt: Date;
          }
        >;
      }
    >();
    for (const game of games) {
      for (const player of game.players) {
        if (!player.userId) continue;
        const item = users.get(player.userId) ?? {
          games: 0,
          wins: 0,
          decks: new Map(),
        };
        item.games++;
        if (game.winnerWho === player.who) item.wins++;
        const deck = player.deckJson as unknown as DeckSnapshot;
        const deckKey = JSON.stringify(deck);
        const usage = item.decks.get(deckKey) ?? {
          deck,
          uses: 0,
          firstUsedAt: game.createdAt,
          lastUsedAt: game.createdAt,
        };
        usage.uses++;
        if (game.createdAt < usage.firstUsedAt)
          usage.firstUsedAt = game.createdAt;
        if (game.createdAt > usage.lastUsedAt)
          usage.lastUsedAt = game.createdAt;
        item.decks.set(deckKey, usage);
        users.set(player.userId, item);
      }
    }
    const profiles = await this.prisma.user.findMany({
      where: { id: { in: [...users.keys()] } },
      select: { id: true, qq: true, name: true },
    });
    return profiles.map((profile) => {
      const item = users.get(profile.id)!;
      return {
        ...profile,
        games: item.games,
        wins: item.wins,
        winRate: item.games ? item.wins / item.games : 0,
        decks: [...item.decks.values()],
      };
    });
  }

  async options() {
    const events = await this.prisma.tournamentEvent.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    });
    return { events };
  }

  async rankings(eventIds: number[]) {
    const matches = await this.prisma.tournamentMatch.findMany({
      where: { eventId: { in: eventIds } },
      include: {
        participants: true,
        games: { where: { status: "FINISHED" }, select: { id: true } },
      },
    });
    const completed = matches.filter(
      (match) =>
        match.winnerUserId !== null || match.games.length >= match.maxGames,
    );
    const base = new Map<
      number,
      { played: number; won: number; opponents: Set<number> }
    >();
    const ensure = (userId: number) => {
      const item = base.get(userId) ?? {
        played: 0,
        won: 0,
        opponents: new Set<number>(),
      };
      base.set(userId, item);
      return item;
    };
    for (const match of completed) {
      for (const participant of match.participants) {
        const item = ensure(participant.userId);
        item.played++;
        if (match.winnerUserId === participant.userId) item.won++;
        for (const opponent of match.participants) {
          if (opponent.userId !== participant.userId)
            item.opponents.add(opponent.userId);
        }
      }
    }
    const fraction = (ids: number[]) => {
      let numerator = 0;
      let denominator = 0;
      for (const id of ids) {
        const item = base.get(id);
        numerator += item?.won ?? 0;
        denominator += item?.played ?? 0;
      }
      return {
        numerator,
        denominator,
        value: denominator ? numerator / denominator : 0,
      };
    };
    const rankings = [...base].map(([userId, item]) => {
      const opponents = [...item.opponents];
      const tieBreak = fraction(opponents);
      const secondIds = opponents.flatMap((id) => [
        ...(base.get(id)?.opponents ?? []),
      ]);
      const secondTieBreak = fraction(secondIds);
      return {
        userId,
        played: item.played,
        won: item.won,
        opponents,
        tieBreak,
        secondTieBreak: { ...secondTieBreak, opponents: secondIds },
      };
    });
    rankings.sort(
      (a, b) =>
        b.won - a.won ||
        b.tieBreak.value - a.tieBreak.value ||
        b.secondTieBreak.value - a.secondTieBreak.value ||
        a.userId - b.userId,
    );
    return rankings.map((item, index) => ({ rank: index + 1, ...item }));
  }
}
