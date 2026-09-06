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

import type { Deck } from "@gi-tcg/typings";
import {
  AssetsManager,
  DEFAULT_ASSETS_API_ENDPOINT,
  DEFAULT_ASSETS_MANAGER,
  type AssetsManagerOption,
  type OverrideData,
} from "@gi-tcg/assets-manager";
import {
  IsInt,
  IsOptional,
  IsPositive,
  Max,
  validate,
  ValidationError,
} from "class-validator";
import {
  createOfficialVersionResolver,
  CURRENT_VERSION,
  getVersionBehavior,
  type Version,
  type VersionBehavior,
} from "@gi-tcg/core";
import {
  plainToClass,
  Transform,
  type ClassConstructor,
  type TransformFnParams,
} from "class-transformer";
import { createId as createCuid, isCuid } from "@paralleldrive/cuid2";
import { BadRequestException } from "@nestjs/common";
import DEPS from "@gi-tcg/data-code-analyzer";
import { CustomDataLoader } from "@gi-tcg/custom-data-loader";

export enum DeckVerificationErrorCode {
  SizeError = "SizeError",
  NotFoundError = "NotFoundError",
  CountLimitError = "CountLimitError",
  RelationError = "RelationError",
}

export class DeckVerificationError extends Error {
  constructor(
    public readonly code: DeckVerificationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const MATCH_CONFIG = (await fetch(
  "https://piovium.github.io/lianyu-s1-data-config/config.json",
).then((res) => res.json())) as {
  version: string;
  overrides: OverrideData[];
  versions: Record<string, Version>;
  mods: string[];
};
export const MATCH_CONFIG_VERSION = MATCH_CONFIG.version;
export const versionResolver = createOfficialVersionResolver(
  void 0,
  MATCH_CONFIG.versions,
  DEPS,
);
const customDataLoader = new CustomDataLoader();
customDataLoader.setVersion(versionResolver);
await customDataLoader.loadMod(...MATCH_CONFIG.mods);
const [gameData, amOptions] = customDataLoader.done();

export const ASSETS_MANAGER_OPTIONS: Partial<AssetsManagerOption> = {
  ...amOptions,
  apiEndpoint: DEFAULT_ASSETS_API_ENDPOINT,
  language: "CHS",
  overrideData: [...(amOptions.overrideData ?? []), ...MATCH_CONFIG.overrides],
  version: versionResolver.versionMap,
  defaultDeckCompatible: true,
};
export { gameData as GAME_DATA };
export const GAME_VERSION_BEHAVIOR: VersionBehavior = {
  ...getVersionBehavior("v7.0.0"),
  discardMaxCostHandsAbortPreview: false,
};

export const ASSETS_MANAGER = new AssetsManager(ASSETS_MANAGER_OPTIONS);

const SINGLETON_REQUIRED_TAGS = ["GCG_TAG_LEGEND", "GCG_TAG_CARD_BLESSING"];

/**
 * 校验牌组合法性
 * @param param0 牌组
 * @returns 牌组可以打出的最低游戏版本
 */
export async function verifyDeck({
  characters,
  cards,
}: Deck): Promise<Version> {
  const DEC = DeckVerificationErrorCode;
  const deckData = await ASSETS_MANAGER.getDeckData();
  const characterSet = new Set(characters);
  if (characterSet.size !== 3) {
    throw new DeckVerificationError(
      DEC.SizeError,
      "deck must contain 3 characters",
    );
  }
  if (cards.length !== 30) {
    throw new DeckVerificationError(
      DEC.SizeError,
      "deck must contain 30 cards",
    );
  }
  const characterTags = [];
  for (const chId of characters) {
    const character = deckData.characters.get(chId);
    if (!character) {
      throw new DeckVerificationError(
        DEC.NotFoundError,
        `character id ${chId} not found`,
      );
    }
    characterTags.push(...character.tags);
  }
  const cardCounts = new Map<number, number>();
  for (const cardId of cards) {
    const card = deckData.actionCards.get(cardId);
    if (!card) {
      throw new DeckVerificationError(
        DEC.NotFoundError,
        `card id ${cardId} not found`,
      );
    }
    const cardMaxCount = SINGLETON_REQUIRED_TAGS.some((tag) =>
      card?.tags.includes(tag),
    )
      ? 1
      : 2;
    if (cardCounts.has(cardId)) {
      const count = cardCounts.get(cardId)! + 1;
      if (count > cardMaxCount) {
        throw new DeckVerificationError(
          DEC.CountLimitError,
          `card id ${cardId} exceeds max count`,
        );
      }
      cardCounts.set(cardId, count);
    } else {
      if (
        card.relatedCharacterId !== null &&
        !characters.includes(card.relatedCharacterId)
      ) {
        throw new DeckVerificationError(
          DEC.RelationError,
          `card id ${cardId} related character not in deck`,
        );
      }
      if (
        card.relatedCharacterTag !== null &&
        characterTags.filter((tag) => tag === card.relatedCharacterTag)
          .length < 2
      ) {
        throw new DeckVerificationError(
          DEC.RelationError,
          `card id ${cardId} related character tags not in deck`,
        );
      }
      cardCounts.set(cardId, 1);
    }
  }
  return CURRENT_VERSION;
}

export async function minimumRequiredVersionOfDeck(_: Deck): Promise<Version> {
  return CURRENT_VERSION;
}

export function parseStringToInt({ value }: TransformFnParams): number {
  return typeof value !== "string" || value.trim() === "" ? NaN : Number(value);
}

export function createGuestId() {
  return `guest-${createCuid()}`;
}

export function isGuestId(id: unknown): id is string {
  if (typeof id !== "string") {
    return false;
  }
  const [tag, cuid] = id.split("-");
  return tag === "guest" && !!cuid && isCuid(cuid);
}

export class PaginationDto {
  @IsInt()
  @IsPositive()
  @IsOptional()
  @Transform(parseStringToInt)
  skip?: number;

  @IsInt()
  @IsPositive()
  @Max(30)
  @IsOptional()
  @Transform(parseStringToInt)
  take?: number;
}

export interface PaginationResult<T> {
  count: number;
  data: T[];
}

type ValidationErrorWithConstraints = ValidationError & {
  constraints?: Record<string, string>;
};

// https://github.com/nestjs/nest/blob/b6ea2a1899fe54f289e2c6188c843705c9072698/packages/common/pipes/validation.pipe.ts#L266

function mapChildrenToValidationErrors(
  error: ValidationError,
  parentPath?: string,
): ValidationErrorWithConstraints[] {
  if (!(error.children && error.children.length)) {
    return [error];
  }
  const validationErrors = [];
  parentPath = parentPath ? `${parentPath}.${error.property}` : error.property;
  for (const item of error.children) {
    if (item.children && item.children.length) {
      validationErrors.push(...mapChildrenToValidationErrors(item, parentPath));
    }
    validationErrors.push(prependConstraintsWithParentProp(parentPath, item));
  }
  return validationErrors;
}

function prependConstraintsWithParentProp(
  parentPath: string,
  error: ValidationError,
): ValidationErrorWithConstraints {
  const constraints: Record<string, string> = {};
  for (const key in error.constraints) {
    constraints[key] = `${parentPath}.${error.constraints[key]}`;
  }
  return {
    ...error,
    constraints,
  };
}

function flattenValidationErrors(
  validationErrors: ValidationError[],
): string[] {
  return validationErrors
    .flatMap((error) => mapChildrenToValidationErrors(error))
    .filter((item) => !!item.constraints)
    .flatMap((item) => Object.values(item.constraints!));
}

export async function validateDto<T extends object>(
  value: unknown,
  type: ClassConstructor<T>,
): Promise<T> {
  const dto = plainToClass(type, value);
  const errors = await validate(dto);
  if (errors.length > 0) {
    throw new BadRequestException(flattenValidationErrors(errors));
  }
  return dto;
}
