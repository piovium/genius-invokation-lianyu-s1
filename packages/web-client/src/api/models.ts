import type { Deck } from "@gi-tcg/typings";

export type EventPhase = "DECK_COLLECTION" | "RUNNING" | "FINISHED";
export type MatchMode = "UNRESTRICTED" | "DUEL" | "CONQUEST";
export type CompetitionStatus = "NONE" | "REGISTERED" | "PLAYER";
export type GameStatus = "PENDING" | "FINISHED";

export interface RegistrationSettings {
  cutoffAt: string | null;
  limit: number;
  registeredCount?: number;
  isOpen?: boolean;
}

export interface Participant {
  matchId: number;
  userId: number;
  who: number;
  status: "ACTIVE" | "WITHDRAWN";
  user: { id: number; qq?: string; name: string };
}

export interface GamePlayer {
  gameId: number;
  who: number;
  userId: number | null;
  deckId: number | null;
  matchDeckId: number | null;
  deckName: string | null;
  deckJson: Deck | null;
  characterKey: string | null;
}

export interface TournamentGame {
  id: number;
  matchId: number;
  status: GameStatus;
  coreVersion: string;
  gameVersion: string;
  winnerWho: number | null;
  manualWinnerWho: number | null;
  countForStats: boolean;
  endReason: string | null;
  stateLog?: unknown;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  runtimeStatus?: "WAITING" | "PLAYING" | "FINALIZING" | null;
  players: GamePlayer[];
}

export interface MatchDeck {
  id: number;
  matchId: number;
  userId: number;
  sourceDeckId: number | null;
  name: string;
  code: string;
  requiredVersion: number;
  deckJson: Deck;
  characterKey: string;
  usable: boolean;
  disableReason: string | null;
  frozenAt: string | null;
  match?: TournamentMatch & { event: TournamentEvent };
}

export interface TournamentMatch {
  id: number;
  eventId: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  mode: MatchMode;
  maxGames: number;
  winsRequired: number;
  roomConfig: Record<string, unknown>;
  autoCreateGame: boolean;
  winnerUserId: number | null;
  participants: Participant[];
  matchDecks: MatchDeck[];
  games: TournamentGame[];
  event?: TournamentEvent;
}

export interface TournamentEvent {
  id: number;
  name: string;
  phase: EventPhase;
  deckLimit: number;
  createdAt: string;
  updatedAt: string;
  matches?: TournamentMatch[];
  _count?: { matches: number };
}

export interface AdminUser {
  id: number;
  qq: string;
  name: string;
  role: "USER" | "ADMIN";
  competitionStatus: CompetitionStatus;
  appliedAt: string | null;
  activeMatchId: number | null;
  createdAt: string;
  inRunningGame?: boolean;
}

export interface Ranking {
  rank: number;
  userId: number;
  played: number;
  won: number;
  opponents: number[];
  tieBreak: { numerator: number; denominator: number; value: number };
  secondTieBreak: {
    numerator: number;
    denominator: number;
    value: number;
    opponents: number[];
  };
}

export interface AuditLog {
  id: number;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { id: number; qq: string; name: string };
}
