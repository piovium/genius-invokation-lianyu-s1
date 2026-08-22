// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  clearPlayingPlayers,
  clearTournamentRuntimeStatus,
  getTournamentRuntimeStatus,
  isPlayerInRunningRoom,
  markPlayersPlaying,
  setTournamentRuntimeStatus,
} from "./room-runtime";

describe("room runtime registry", () => {
  it("tracks and clears playing users", () => {
    markPlayersPlaying([101, 102]);
    markPlayersPlaying([101]);
    expect(isPlayerInRunningRoom(101)).toBe(true);
    clearPlayingPlayers([101, 102]);
    expect(isPlayerInRunningRoom(101)).toBe(true);
    clearPlayingPlayers([101]);
    expect(isPlayerInRunningRoom(101)).toBe(false);
  });

  it("tracks the tournament room lifecycle", () => {
    setTournamentRuntimeStatus(7, "WAITING");
    expect(getTournamentRuntimeStatus(7)).toBe("WAITING");
    setTournamentRuntimeStatus(7, "PLAYING");
    expect(getTournamentRuntimeStatus(7)).toBe("PLAYING");
    setTournamentRuntimeStatus(7, "FINALIZING");
    expect(getTournamentRuntimeStatus(7)).toBe("FINALIZING");
    clearTournamentRuntimeStatus(7);
    expect(getTournamentRuntimeStatus(7)).toBeNull();
  });
});
