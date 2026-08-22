import { A } from "@solidjs/router";
import axios from "axios";
import { For, Show, createResource, onCleanup, onMount } from "solid-js";
import type { TournamentMatch } from "../api/models";
import { useAuth } from "../auth";

const phaseLabel = {
  DECK_COLLECTION: "收集牌组中",
  RUNNING: "进行中",
  FINISHED: "已结束",
} as const;
const modeLabel = {
  UNRESTRICTED: "无限制",
  DUEL: "决斗",
  CONQUEST: "征服",
} as const;

export function MyMatches() {
  const auth = useAuth();
  const [matches, { refetch }] = createResource<TournamentMatch[]>(() =>
    axios.get("users/me/matches").then((r) => r.data),
  );
  let timer: number | undefined;
  onMount(
    () =>
      (timer = window.setInterval(
        () => document.visibilityState === "visible" && refetch(),
        5000,
      )),
  );
  onCleanup(() => timer && clearInterval(timer));
  const user = () => {
    const current = auth.status();
    return current.type === "user" ? current : null;
  };
  const me = () => user()?.id ?? null;

  return (
    <Show when={user()?.competitionStatus === "PLAYER"}>
      <section class="mb-6">
        <div class="flex items-center gap-2 mb-3">
          <h3 class="text-xl font-bold">我的比赛</h3>
          <button
            class="btn btn-ghost p-1"
            onClick={() => refetch()}
            aria-label="刷新我的比赛"
          >
            <i class="i-mdi-refresh" />
          </button>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <For
            each={matches()}
            fallback={<p class="text-gray-5">暂无活跃比赛。</p>}
          >
            {(match) => {
              const opponent = () =>
                match.participants.find((item) => item.userId !== me());
              const wins = (userId: number | null) =>
                match.games.filter((game) => {
                  const who = game.manualWinnerWho ?? game.winnerWho;
                  return (
                    game.status === "FINISHED" &&
                    game.players.find((p) => p.who === who)?.userId === userId
                  );
                }).length;
              return (
                <article class="rounded-xl b b-amber-3 p-4 bg-white">
                  <div class="flex flex-wrap gap-2 justify-between">
                    <h4 class="font-bold">
                      {match.event?.name ?? `场次 #${match.eventId}`}
                    </h4>
                    <span class="badge badge-soft-warning">
                      {phaseLabel[match.event?.phase ?? "RUNNING"]}
                    </span>
                  </div>
                  <p class="mt-2">
                    对手：{opponent()?.user.name ?? "轮空"} ·{" "}
                    {modeLabel[match.mode]}
                  </p>
                  <p class="text-sm text-gray-5">
                    {match.scheduledStart
                      ? new Date(match.scheduledStart).toLocaleString()
                      : "未指定开始时间"}{" "}
                    —{" "}
                    {match.scheduledEnd
                      ? new Date(match.scheduledEnd).toLocaleString()
                      : "未指定结束时间"}
                  </p>
                  <p class="text-sm mt-1">
                    比分 {wins(me())} : {wins(opponent()?.userId ?? null)} ·{" "}
                    {match.maxGames} 局 {match.winsRequired} 胜
                  </p>
                  <ul class="mt-3 flex flex-col gap-2">
                    <For each={match.games}>
                      {(game, index) => (
                        <li class="rounded-lg b b-gray-2 p-2 flex items-center justify-between">
                          <div>
                            <span class="font-bold">第 {index() + 1} 局</span>{" "}
                            <span class="text-sm">
                              {game.status === "FINISHED"
                                ? "已结束"
                                : game.startedAt
                                  ? "进行中"
                                  : "未开始"}
                            </span>
                            <Show when={game.status === "FINISHED"}>
                              <span class="ml-2 text-sm">
                                原始赢家：
                                {game.winnerWho === null
                                  ? "无"
                                  : `玩家 ${game.winnerWho}`}
                                {game.manualWinnerWho !== null
                                  ? ` · 裁定玩家 ${game.manualWinnerWho}`
                                  : ""}
                              </span>
                            </Show>
                          </div>
                          <Show when={game.status === "PENDING"}>
                            <A
                              class="btn btn-outline-primary"
                              href={`/competition/games/${game.id}`}
                            >
                              {game.startedAt ? "重连" : "进入"}
                            </A>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={match.winnerUserId}>
                    <p class="mt-3 font-bold text-green-7">
                      本盘赢家：
                      {
                        match.participants.find(
                          (p) => p.userId === match.winnerUserId,
                        )?.user.name
                      }
                    </p>
                  </Show>
                </article>
              );
            }}
          </For>
        </div>
      </section>
    </Show>
  );
}
