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

import { For, Show, createResource } from "solid-js";
import { A } from "@solidjs/router";
import { useAuth } from "../auth";
import { getPlayerAvatarUrl, roomIdToCode } from "../utils";
import type { PlayerInfo } from "../utils";
import { useI18n } from "../i18n";

export interface RoomInfo {
  id: number;
  watchable: boolean;
  config: any;
  players: PlayerInfo[];
  tournamentGameId?: number | null;
  tournamentPlayers?:
    Pick<PlayerInfo, "isGuest" | "id" | "name" | "avatarUrl">[] | null;
}

export interface RoomInfoProps extends RoomInfo {
  onJoin?: (roomInfo: RoomInfo) => void;
}

export function RoomInfo(props: RoomInfoProps) {
  const { t } = useI18n();
  const { status } = useAuth();
  const isAdmin = () => {
    const current = status();
    return current.type === "user" && current.role === "ADMIN";
  };
  const insideRoom = () => props.players.some((p) => p.id === status()?.id);
  const displayedPlayers = () => props.tournamentPlayers ?? props.players;
  const code = () => roomIdToCode(props.id);
  const url = (playerId: string | number) => {
    if (insideRoom()) {
      return `/rooms/${code()}?player=${status()!.id}&action=1`;
    } else {
      return `/rooms/${code()}?player=${playerId}`;
    }
  };
  const [avatarUrl0] = createResource(displayedPlayers, (players) => {
    return players[0] && getPlayerAvatarUrl(players[0]);
  });
  const [avatarUrl1] = createResource(displayedPlayers, (players) => {
    return players[1] && getPlayerAvatarUrl(players[1]);
  });
  return (
    <div class="w-full bg-yellow-100 rounded-xl p-4 flex flex-col">
      <div class="flex flex-row items-center gap-2 mb-3">
        <h4 class="font-semibold">{t("room", { code: code() })}</h4>
        <Show when={!props.watchable}>
          <span class="badge badge-soft-error" title={t("spectateUnavailable")}>
            禁止观战
          </span>
        </Show>
        <Show when={props.config?.private}>
          <span class="badge badge-soft-warning">私密</span>
        </Show>
        <Show when={props.tournamentGameId}>
          <span class="badge badge-soft-primary">
            赛事对局 #{props.tournamentGameId}
          </span>
        </Show>
        <Show when={isAdmin() && (!props.watchable || props.config?.private)}>
          <span class="badge badge-soft-primary">管理员可查看</span>
        </Show>
      </div>
      <div
        class="grid items-center group grid-cols-[calc(50%-1rem)_2rem_calc(50%-1rem)]"
        data-disabled={!insideRoom() && !props.watchable && !isAdmin()}
      >
        <Show
          when={displayedPlayers().length > 0}
          fallback={
            <p class="col-span-3 text-yellow-700 italic">等待赛事选手加入</p>
          }
        >
          <A
            href={url(displayedPlayers()[0].id)}
            class="flex flex-row items-center h-6 rounded-r-xl pr-2 bg-yellow-800 text-yellow-100 ml-2 hover:bg-yellow-700 transition-colors group-data-[disabled=true]:pointer-events-none max-w-[calc(100%-0.5rem)] mr-auto whitespace-nowrap"
          >
            <img
              src={avatarUrl0()}
              width="30"
              height="30"
              class="rounded-full bg-yellow-100 b-yellow-800 b-1 translate-x--2"
            />
            <span class="overflow-hidden text-ellipsis">
              {displayedPlayers()[0].name}
            </span>
          </A>
          <span class="text-xl font-bold w-8 text-center">VS</span>
          <Show
            when={displayedPlayers().length > 1}
            fallback={
              <div class="flex flex-row items-center justify-end gap-2 ml-auto">
                <span class="text-yellow-600 italic">{t("slotAvailable")}</span>
                <Show when={!insideRoom() && !props.tournamentGameId}>
                  <button
                    class="h-30px w-30px rounded-full bg-yellow-800 flex items-center justify-center text-lg text-yellow-100 font-bold select-none hover:bg-yellow-700 transition-colors"
                    onClick={() => props.onJoin?.(props)}
                  >
                    +
                  </button>
                </Show>
              </div>
            }
          >
            <A
              href={url(displayedPlayers()[1].id)}
              class="flex flex-row items-center justify-end h-6 rounded-l-xl pl-2 bg-yellow-800 text-yellow-100 mr-2 hover:bg-yellow-700 transition-colors group-data-[disabled=true]:pointer-events-none max-w-[calc(100%-0.5rem)] ml-auto whitespace-nowrap"
            >
              <span class="overflow-hidden text-ellipsis">
                {displayedPlayers()[1].name}
              </span>
              <img
                src={avatarUrl1()}
                width="30"
                height="30"
                class="rounded-full bg-yellow-100 b-yellow-800 b-1 translate-x-2"
              />
            </A>
          </Show>
        </Show>
      </div>
    </div>
  );
}
