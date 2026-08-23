// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

interface RoomStateLogPlayerInput {
  id: number | string;
  name: string;
}

export function serializeRoomStateLogPlayers(
  players: readonly [
    RoomStateLogPlayerInput | null,
    RoomStateLogPlayerInput | null,
  ],
) {
  return players.map((player, who) =>
    player ? { who: who as 0 | 1, id: player.id, name: player.name } : null,
  );
}
