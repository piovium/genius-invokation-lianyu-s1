// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
  copies?: number;
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

  private gameWhere(filters: StatisticsFilters): Prisma.GameWhereInput {
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

    return {
      status: "FINISHED",
      countForStats: true,
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      AND: [{ OR: sources }, { OR: endings }],
    };
  }

  private validSample(game: { players: { deckJson: unknown }[] }) {
    return (
      game.players.length === 2 &&
      game.players.every((player) => {
        const deck = player.deckJson as unknown as DeckSnapshot | null;
        return Array.isArray(deck?.characters) && Array.isArray(deck?.cards);
      })
    );
  }

  private effectiveWinner(game: {
    winnerWho: number | null;
    manualWinnerWho: number | null;
    endReason: string | null;
  }) {
    return game.endReason === "ADMIN"
      ? (game.manualWinnerWho ?? game.winnerWho)
      : game.winnerWho;
  }

  private async samples(filters: StatisticsFilters) {
    const games = await this.prisma.game.findMany({
      where: this.gameWhere(filters),
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
    });
    return games
      .filter((game) => this.validSample(game))
      .map((game) => ({
        ...game,
        winnerWho: this.effectiveWinner(game),
      }));
  }

  async overview(filters: StatisticsFilters) {
    const games = await this.samples(filters);
    const characters = new Map<string, Aggregate>();
    const actionCards = new Map<string, Aggregate>();
    const combinations = new Map<string, Aggregate>();
    const users = new Map<number, { games: number; wins: number }>();
    const touch = (map: Map<string, Aggregate>, id: string, win: boolean) => {
      const item = map.get(id) ?? { appearances: 0, wins: 0 };
      item.appearances++;
      if (win) item.wins++;
      map.set(id, item);
    };
    for (const game of games) {
      const keys = game.players.map((player) => {
        const deck = player.deckJson as unknown as DeckSnapshot;
        return player.characterKey ?? characterKey(deck.characters);
      });
      for (const player of game.players) {
        const deck = player.deckJson as unknown as DeckSnapshot;
        const win = game.winnerWho === player.who;
        for (const id of new Set(deck.characters))
          touch(characters, String(id), win);
        for (const id of new Set(deck.cards))
          touch(actionCards, String(id), win);
        for (const id of deck.cards) {
          const item = actionCards.get(String(id))!;
          item.copies = (item.copies ?? 0) + 1;
        }
        const key = player.characterKey ?? characterKey(deck.characters);
        touch(combinations, key, win);
        if (keys[0] !== keys[1]) {
          const item = combinations.get(key)!;
          item.awayAppearances = (item.awayAppearances ?? 0) + 1;
          if (win) item.awayWins = (item.awayWins ?? 0) + 1;
        }
        if (!player.userId) continue;
        const item = users.get(player.userId) ?? {
          games: 0,
          wins: 0,
        };
        item.games++;
        if (game.winnerWho === player.who) item.wins++;
        users.set(player.userId, item);
      }
    }
    const denominator = games.length * 2;
    const serialize = (map: Map<string, Aggregate>, includeCopies = false) =>
      [...map.entries()]
        .map(([id, item]) => {
          const { copies = 0, ...aggregate } = item;
          return {
            id,
            ...aggregate,
            appearanceRate: denominator ? item.appearances / denominator : 0,
            winRate: item.appearances ? item.wins / item.appearances : 0,
            awayWinRate: item.awayAppearances
              ? (item.awayWins ?? 0) / item.awayAppearances
              : 0,
            ...(includeCopies
              ? {
                  averageCopies: denominator ? copies / denominator : 0,
                  netCopies: item.appearances ? copies / item.appearances : 0,
                }
              : {}),
          };
        })
        .sort(
          (a, b) => b.appearances - a.appearances || a.id.localeCompare(b.id),
        );
    const profiles = await this.prisma.user.findMany({
      where: { id: { in: [...users.keys()] } },
      select: { id: true, qq: true, name: true },
    });
    return {
      gameCount: games.length,
      denominator,
      characters: serialize(characters),
      actionCards: serialize(actionCards, true),
      combinations: serialize(combinations),
      users: profiles.map((profile) => {
        const item = users.get(profile.id)!;
        return {
          ...profile,
          games: item.games,
          wins: item.wins,
          winRate: item.games ? item.wins / item.games : 0,
        };
      }),
    };
  }

  async combination(requestedKey: string, filters: StatisticsFilters) {
    const ids = requestedKey.split(":").map(Number);
    if (
      ids.length !== 3 ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      throw new BadRequestException("Invalid character combination");
    }
    const selectedKey = characterKey(ids);
    const games = await this.samples(filters);
    const denominator = games.length * 2;
    const anchor = filters.createdAtTo
      ? this.date(filters.createdAtTo, true)
      : new Date();
    const day = 86_400_000;
    const trendBuckets = [
      { key: "last1Day", label: "近1日" },
      { key: "last3Days", label: "近3日" },
      { key: "last7Days", label: "近7日" },
      { key: "earlier", label: "更早" },
    ] as const;
    type Counter = { appearances: number; wins: number };
    type SplitCounter = Counter & {
      mirrorAppearances: number;
      mirrorWins: number;
      awayAppearances: number;
      awayWins: number;
    };
    const counter = (): Counter => ({ appearances: 0, wins: 0 });
    const splitCounter = (): SplitCounter => ({
      appearances: 0,
      wins: 0,
      mirrorAppearances: 0,
      mirrorWins: 0,
      awayAppearances: 0,
      awayWins: 0,
    });
    const rate = (numerator: number, value: number) =>
      value ? numerator / value : null;
    const overview = splitCounter();
    const trends = trendBuckets.map(() => ({
      gameCount: 0,
      ...splitCounter(),
    }));
    const matchups = new Map<string, Counter>();
    const positions = new Map<string, SplitCounter>();
    const actionCards = new Map<string, SplitCounter & { copies: number }>();
    const bucketOf = (createdAt: Date) => {
      const age = anchor.getTime() - createdAt.getTime();
      if (age < 0) return -1;
      if (age < day) return 0;
      if (age < 3 * day) return 1;
      if (age < 7 * day) return 2;
      return 3;
    };

    for (const game of games) {
      const bucket = bucketOf(game.createdAt);
      if (bucket >= 0) trends[bucket]!.gameCount++;
      const keys = game.players.map((player) => {
        const deck = player.deckJson as unknown as DeckSnapshot;
        return player.characterKey ?? characterKey(deck.characters);
      });
      for (let index = 0; index < game.players.length; index++) {
        if (keys[index] !== selectedKey) continue;
        const player = game.players[index]!;
        const deck = player.deckJson as unknown as DeckSnapshot;
        const win = game.winnerWho === player.who;
        const mirror = keys[0] === keys[1];
        const touch = (item: SplitCounter) => {
          item.appearances++;
          if (win) item.wins++;
          if (mirror) {
            item.mirrorAppearances++;
            if (win) item.mirrorWins++;
          } else {
            item.awayAppearances++;
            if (win) item.awayWins++;
          }
        };
        touch(overview);
        if (bucket >= 0) touch(trends[bucket]!);

        if (!mirror) {
          const opponentKey = keys[index === 0 ? 1 : 0]!;
          const item = matchups.get(opponentKey) ?? counter();
          item.appearances++;
          if (win) item.wins++;
          matchups.set(opponentKey, item);
        }

        const positionKey = deck.characters.join(":");
        const position = positions.get(positionKey) ?? splitCounter();
        touch(position);
        positions.set(positionKey, position);

        for (const id of new Set(deck.cards)) {
          const key = String(id);
          const item = actionCards.get(key) ?? {
            ...splitCounter(),
            copies: 0,
          };
          touch(item);
          actionCards.set(key, item);
        }
        for (const id of deck.cards) {
          actionCards.get(String(id))!.copies++;
        }
      }
    }

    const overviewResult = {
      id: selectedKey,
      appearances: overview.appearances,
      wins: overview.wins,
      appearanceRate: rate(overview.appearances, denominator),
      winRate: rate(overview.wins, overview.appearances),
      awayAppearances: overview.awayAppearances,
      awayWins: overview.awayWins,
      awayWinRate: rate(overview.awayWins, overview.awayAppearances),
    };
    const serializeMatchup = ([id, item]: [string, Counter]) => ({
      id,
      appearances: item.appearances,
      wins: item.wins,
      winRate: rate(item.wins, item.appearances),
    });
    const matchupRows = [...matchups.entries()].map(serializeMatchup);
    const topMatchups = (advantage: boolean) =>
      matchupRows
        .filter((item) =>
          advantage ? (item.winRate ?? 0) >= 0.5 : (item.winRate ?? 0) < 0.5,
        )
        .sort(
          (a, b) =>
            b.appearances - a.appearances ||
            (b.winRate ?? 0) - (a.winRate ?? 0) ||
            a.id.localeCompare(b.id),
        )
        .slice(0, 8);

    return {
      characterKey: selectedKey,
      anchor: anchor.toISOString(),
      overview: overviewResult,
      trend: trendBuckets.map((definition, index) => {
        const item = trends[index]!;
        return {
          key: definition.key,
          label: definition.label,
          gameCount: item.gameCount,
          appearances: item.appearances,
          appearanceRate: rate(item.appearances, item.gameCount * 2),
          winRate: rate(item.wins, item.appearances),
          awayWinRate: rate(item.awayWins, item.awayAppearances),
        };
      }),
      matchups: {
        advantages: topMatchups(true),
        disadvantages: topMatchups(false),
      },
      positions: [...positions.entries()]
        .map(([id, item]) => ({
          id,
          appearances: item.appearances,
          appearanceRate: rate(item.appearances, overview.appearances),
          winRate: rate(item.wins, item.appearances),
          mirrorWinRate: rate(item.mirrorWins, item.mirrorAppearances),
          awayWinRate: rate(item.awayWins, item.awayAppearances),
        }))
        .sort(
          (a, b) => b.appearances - a.appearances || a.id.localeCompare(b.id),
        ),
      actionCards: [...actionCards.entries()]
        .map(([id, item]) => ({
          id,
          appearances: item.appearances,
          averageCopies: rate(item.copies, overview.appearances),
          netCopies: rate(item.copies, item.appearances),
          winRate: rate(item.wins, item.appearances),
          mirrorWinRate: rate(item.mirrorWins, item.mirrorAppearances),
          awayWinRate: rate(item.awayWins, item.awayAppearances),
        }))
        .sort(
          (a, b) =>
            (b.averageCopies ?? 0) - (a.averageCopies ?? 0) ||
            b.appearances - a.appearances ||
            a.id.localeCompare(b.id),
        )
        .slice(0, 40),
    };
  }

  async user(userId: number, filters: StatisticsFilters) {
    const [profile, games] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, qq: true, name: true },
      }),
      this.samples(filters),
    ]);
    if (!profile) throw new NotFoundException("User not found");

    type Counter = { appearances: number; wins: number };
    const overall = new Map<string, Counter>();
    const combinations = new Map<string, Counter>();
    let appearances = 0;
    let wins = 0;
    const touch = (map: Map<string, Counter>, id: string, win: boolean) => {
      const item = map.get(id) ?? { appearances: 0, wins: 0 };
      item.appearances++;
      if (win) item.wins++;
      map.set(id, item);
    };

    for (const game of games) {
      for (const player of game.players) {
        const deck = player.deckJson as unknown as DeckSnapshot;
        const key = player.characterKey ?? characterKey(deck.characters);
        const win = game.winnerWho === player.who;
        touch(overall, key, win);
        if (player.userId !== userId) continue;
        appearances++;
        if (win) wins++;
        touch(combinations, key, win);
      }
    }
    const rate = (numerator: number, denominator: number) =>
      denominator ? numerator / denominator : null;

    return {
      user: profile,
      overview: {
        games: appearances,
        wins,
        winRate: rate(wins, appearances),
      },
      combinations: [...combinations.entries()]
        .map(([id, item]) => {
          const baseline = overall.get(id)!;
          return {
            id,
            appearances: item.appearances,
            wins: item.wins,
            winRate: rate(item.wins, item.appearances),
            overviewWinRate: rate(baseline.wins, baseline.appearances),
          };
        })
        .sort(
          (a, b) => b.appearances - a.appearances || a.id.localeCompare(b.id),
        ),
    };
  }

  async userGames(userId: number, filters: StatisticsFilters, skip: number) {
    const games = await this.prisma.game.findMany({
      where: {
        AND: [this.gameWhere(filters), { players: { some: { userId } } }],
      },
      select: {
        id: true,
        matchId: true,
        winnerWho: true,
        manualWinnerWho: true,
        endReason: true,
        roundCount: true,
        createdAt: true,
        finishedAt: true,
        players: {
          select: {
            who: true,
            userId: true,
            deckName: true,
            deckJson: true,
            characterKey: true,
            user: { select: { id: true, name: true, qq: true } },
          },
          orderBy: { who: "asc" },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const validGames = games.filter((game) => this.validSample(game));
    const take = 20;
    return {
      count: validGames.length,
      skip,
      take,
      data: validGames.slice(skip, skip + take).map((game) => {
        const effectiveWinnerWho = this.effectiveWinner(game);
        return {
          id: game.id,
          matchId: game.matchId,
          endReason: game.endReason,
          roundCount: game.roundCount,
          createdAt: game.createdAt,
          finishedAt: game.finishedAt,
          effectiveWinnerWho,
          targetWhos: game.players
            .filter((player) => player.userId === userId)
            .map((player) => player.who),
          players: game.players.map((player) => {
            const deck = player.deckJson as unknown as DeckSnapshot;
            return {
              who: player.who,
              userId: player.userId,
              displayName:
                player.user?.name ??
                (game.matchId === null ? player.deckName : null) ??
                "游客",
              characterKey:
                player.characterKey ?? characterKey(deck.characters),
              deck,
              won: effectiveWinnerWho === player.who,
            };
          }),
        };
      }),
    };
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
