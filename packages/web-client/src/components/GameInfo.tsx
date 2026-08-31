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

import dayjs from "dayjs";
import axios from "axios";
import { useI18n } from "../i18n";
import { errorMessage } from "../api/errors";

type GameEndReason =
  | "NORMAL"
  | "ENGINE_ERROR"
  | "SURRENDER"
  | "IO_ERROR"
  | "TIMEOUT"
  | "ADMIN";

export interface GameRecord {
  who: number;
  deckName: string | null;
  game: {
    id: number;
    matchId: number | null;
    winnerWho: number | null;
    manualWinnerWho: number | null;
    roundCount: number | null;
    endReason: GameEndReason | null;
    countForStats: boolean;
    finishedAt: string | null;
    createdAt: string;
  };
}

export function GameInfo(props: { record: GameRecord }) {
  const { t } = useI18n();
  const game = () => props.record.game;
  const winnerWho = () => game().manualWinnerWho ?? game().winnerWho;
  const won = () => winnerWho() !== null && winnerWho() === props.record.who;
  const resultText = () => {
    if (winnerWho() === null) return "平";
    if (game().manualWinnerWho !== null) {
      return won() ? "胜" : "败";
    }
    return won() ? "胜" : "败";
  };

  const downloadLog = async () => {
    try {
      const { data } = await axios.get<{ stateLog: unknown }>(
        `games/${game().id}`,
      );
      const blob = new Blob([JSON.stringify(data.stateLog)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gameLog-${game().id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(t("downloadFailed", { message: errorMessage(e) }));
    }
  };

  return (
    <article
      class="h-11 w-full min-w-0 flex items-center justify-between gap-2 rounded-lg px-2"
      classList={{
        "bg-amber-1/50": game().matchId === null,
        "bg-purple-1/50": game().matchId !== null,
      }}
    >
      <span
        class="badge shrink-0"
        classList={{
          "badge-soft-success": won(),
          "badge-soft-error": winnerWho() !== null && !won(),
          "badge-soft-warning": winnerWho() === null,
        }}
      >
        {resultText()}
      </span>
      <time
        class="shrink-0 text-xs text-gray-5"
        datetime={game().finishedAt ?? game().createdAt}
      >
        {dayjs(game().finishedAt ?? game().createdAt).format("MM-DD HH:mm")}
      </time>
      <button
        type="button"
        class="btn btn-ghost h-7 w-7 shrink-0 p-0"
        title={t("downloadLog")}
        aria-label={t("downloadLog")}
        onClick={downloadLog}
      >
        <i class="i-mdi-download text-lg" />
      </button>
    </article>
  );
}
