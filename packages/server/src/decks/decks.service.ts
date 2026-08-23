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
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import type {
  CreateDeckDto,
  ImportDeckDto,
  QueryDeckDto,
  UpdateDeckDto,
} from "./decks.controller";
import { type Deck } from "@gi-tcg/typings";
import { Prisma, type Deck as DeckModel } from "#prisma/client";
import { ASSETS_MANAGER, verifyDeck, type PaginationResult } from "../utils";
import { VERSIONS } from "@gi-tcg/core";

interface DeckWithVersion extends Deck {
  code: string;
  requiredVersion: number;
}

export interface DeckWithDeckModel extends DeckWithVersion, DeckModel {
  characterNames: string[];
  competition?: unknown;
}

export function characterKey(characters: readonly number[]) {
  return [...characters].sort((a, b) => a - b).join(":");
}

@Injectable()
export class DecksService {
  constructor(private prisma: PrismaService) {}

  async deckToCode(deck: Deck): Promise<DeckWithVersion> {
    try {
      const sinceVersion = await verifyDeck(deck);
      const requiredVersion = VERSIONS.indexOf(sinceVersion);
      return {
        ...deck,
        code: ASSETS_MANAGER.encode(deck),
        requiredVersion,
      };
    } catch (e) {
      if (e instanceof Error) {
        throw new BadRequestException(e.message);
      } else {
        throw e;
      }
    }
  }

  private codeToDeck(code: string): Deck {
    const deck = ASSETS_MANAGER.decode(code);
    return {
      // code,
      ...deck,
    };
  }

  private characterNames(characters: readonly number[]): string[] {
    return characters.map((id) => ASSETS_MANAGER.getNameSync(id) ?? String(id));
  }

  private async lockMatch(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    matchId: number,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(22002, ${matchId})`;
  }

  async createDeck(userId: number, deck: CreateDeckDto): Promise<DeckModel> {
    const { code, requiredVersion } = await this.deckToCode(deck);
    return await this.prisma.deck.create({
      data: {
        name: deck.name,
        code,
        ownerUserId: userId,
        requiredVersion,
      },
    });
  }

  async getAllDecks(
    userId: number,
    { skip = 0, take = 100, requiredVersion }: QueryDeckDto,
  ): Promise<PaginationResult<DeckWithDeckModel>> {
    const [models, count] = await this.prisma.deck.findManyAndCount({
      skip,
      take,
      where: {
        ownerUserId: userId,
        requiredVersion: {
          lte: requiredVersion,
        },
      },
      include: {
        matchDecks: {
          where: {
            match: { event: { phase: { in: ["DECK_COLLECTION", "RUNNING"] } } },
          },
          include: { match: { include: { event: true } } },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
    const data = models.map((model) => {
      const { characters, cards } = this.codeToDeck(model.code);
      return {
        ...model,
        characters,
        cards,
        characterNames: this.characterNames(characters),
        competition: model.matchDecks[0] ?? null,
      };
    });
    return { data, count };
  }

  async getDeck(
    userId: number,
    deckId: number,
  ): Promise<DeckWithDeckModel | null> {
    const model = await this.prisma.deck.findFirst({
      where: {
        id: deckId,
        ownerUserId: userId,
      },
      include: {
        matchDecks: {
          where: {
            match: { event: { phase: { in: ["DECK_COLLECTION", "RUNNING"] } } },
          },
          include: { match: { include: { event: true } } },
        },
      },
    });
    if (model === null) {
      return null;
    }
    const { characters, cards } = this.codeToDeck(model.code);
    return {
      ...model,
      characters,
      cards,
      characterNames: this.characterNames(characters),
      competition: model.matchDecks[0] ?? null,
    };
  }

  async updateDeck(userId: number, deckId: number, deck: UpdateDeckDto) {
    let code: string | undefined;
    let requiredVersion: number | undefined;
    if (!deck.characters || !deck.cards) {
      if (!deck.characters && !deck.cards) {
        code = void 0;
      } else {
        throw new BadRequestException(
          `characters and cards must be provided together`,
        );
      }
    } else {
      ({ code, requiredVersion } = await this.deckToCode({
        characters: deck.characters,
        cards: deck.cards,
      }));
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.activeMatchId) await this.lockMatch(tx, user.activeMatchId);
      const selected = await tx.matchDeck.findFirst({
        where: {
          sourceDeckId: deckId,
          userId,
          match: { event: { phase: { in: ["DECK_COLLECTION", "RUNNING"] } } },
        },
        include: { match: { include: { event: true } } },
      });
      if (selected?.match.event.phase === "RUNNING") {
        throw new ConflictException("COMPETITION_DECK_LOCKED");
      }
      if (selected && deck.characters) {
        const current = this.codeToDeck(selected.code);
        if (
          characterKey(current.characters) !== characterKey(deck.characters)
        ) {
          throw new ConflictException("COMPETITION_DECK_CHARACTERS_LOCKED");
        }
      }
      const model = await tx.deck.update({
        where: { id: deckId, ownerUserId: userId },
        data: {
          name: deck.name,
          code,
          requiredVersion,
        },
      });
      if (selected) {
        const decoded = this.codeToDeck(model.code);
        await tx.matchDeck.update({
          where: { id: selected.id },
          data: {
            name: model.name,
            code: model.code,
            requiredVersion: model.requiredVersion,
            deckJson: decoded as unknown as Prisma.InputJsonValue,
            characterKey: characterKey(decoded.characters),
          },
        });
      }
      return model;
    });
  }

  async deleteDeck(userId: number, deckId: number) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.activeMatchId) await this.lockMatch(tx, user.activeMatchId);
      const selected = await tx.matchDeck.findFirst({
        where: {
          sourceDeckId: deckId,
          userId,
          match: { event: { phase: { in: ["DECK_COLLECTION", "RUNNING"] } } },
        },
      });
      if (selected) throw new ConflictException("COMPETITION_DECK_LOCKED");
      await tx.deck.delete({ where: { id: deckId, ownerUserId: userId } });
    });
  }

  async importDecks(userId: number, decks: ImportDeckDto[]) {
    const results = [];
    for (const deck of decks) {
      const encoded = await this.deckToCode(deck);
      results.push(
        await this.prisma.deck.upsert({
          where: {
            ownerUserId_clientImportKey: {
              ownerUserId: userId,
              clientImportKey: deck.clientImportKey,
            },
          },
          create: {
            ownerUserId: userId,
            clientImportKey: deck.clientImportKey,
            name: deck.name,
            code: encoded.code,
            requiredVersion: encoded.requiredVersion,
          },
          update: {},
        }),
      );
    }
    return { data: results, count: results.length };
  }

  async selectCompetitionDeck(userId: number, deckId: number) {
    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.competitionStatus !== "PLAYER" || !user.activeMatchId) {
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      }
      await this.lockMatch(tx, user.activeMatchId);
      user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.competitionStatus !== "PLAYER" || !user.activeMatchId) {
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      }
      const match = await tx.tournamentMatch.findUniqueOrThrow({
        where: { id: user.activeMatchId },
        include: { event: true },
      });
      if (match.event.phase !== "DECK_COLLECTION") {
        throw new ConflictException("EVENT_PHASE_MISMATCH");
      }
      const deck = await tx.deck.findFirstOrThrow({
        where: { id: deckId, ownerUserId: userId },
      });
      const decoded = this.codeToDeck(deck.code);
      const key = characterKey(decoded.characters);
      const count = await tx.matchDeck.count({
        where: { matchId: match.id, userId },
      });
      if (match.event.deckLimit > 0 && count >= match.event.deckLimit) {
        throw new ConflictException("COMPETITION_DECK_LIMIT_REACHED");
      }
      const duplicate = await tx.matchDeck.findFirst({
        where: { matchId: match.id, userId, characterKey: key },
      });
      if (duplicate) throw new ConflictException("DUPLICATE_CHARACTER_SET");
      return tx.matchDeck.create({
        data: {
          matchId: match.id,
          userId,
          sourceDeckId: deck.id,
          name: deck.name,
          code: deck.code,
          requiredVersion: deck.requiredVersion,
          deckJson: decoded as unknown as Prisma.InputJsonValue,
          characterKey: key,
        },
      });
    });
  }

  async unselectCompetitionDeck(userId: number, deckId: number) {
    await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.activeMatchId) return;
      await this.lockMatch(tx, user.activeMatchId);
      user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.activeMatchId) return;
      const current = await tx.matchDeck.findFirst({
        where: {
          matchId: user.activeMatchId,
          userId,
          sourceDeckId: deckId,
        },
        include: { match: { include: { event: true } } },
      });
      if (!current) return;
      if (current.match.event.phase !== "DECK_COLLECTION") {
        throw new ConflictException("COMPETITION_DECK_LOCKED");
      }
      await tx.matchDeck.delete({ where: { id: current.id } });
    });
  }
}
