// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

export type TournamentRuntimeStatus = "WAITING" | "PLAYING" | "FINALIZING";

const playingPlayers = new Map<number | string, number>();
const tournamentGames = new Map<number, TournamentRuntimeStatus>();

export function persistedRoundCount(state: {
  phase: string;
  roundNumber: number;
  winner: number | null;
  config: { maxRoundsCount: number };
}) {
  const stoppedAtRoundLimit =
    state.phase === "gameEnd" &&
    state.winner === null &&
    state.roundNumber >= state.config.maxRoundsCount;
  return stoppedAtRoundLimit
    ? Math.max(0, state.roundNumber - 1)
    : state.roundNumber;
}

export function markPlayersPlaying(playerIds: readonly (number | string)[]) {
  for (const playerId of playerIds) {
    playingPlayers.set(playerId, (playingPlayers.get(playerId) ?? 0) + 1);
  }
}

export function clearPlayingPlayers(playerIds: readonly (number | string)[]) {
  for (const playerId of playerIds) {
    const remaining = (playingPlayers.get(playerId) ?? 0) - 1;
    if (remaining > 0) playingPlayers.set(playerId, remaining);
    else playingPlayers.delete(playerId);
  }
}

export function isPlayerInRunningRoom(playerId: number | string) {
  return (playingPlayers.get(playerId) ?? 0) > 0;
}

export function setTournamentRuntimeStatus(
  gameId: number,
  status: TournamentRuntimeStatus,
) {
  tournamentGames.set(gameId, status);
}

export function clearTournamentRuntimeStatus(gameId: number) {
  tournamentGames.delete(gameId);
}

export function getTournamentRuntimeStatus(gameId: number) {
  return tournamentGames.get(gameId) ?? null;
}
