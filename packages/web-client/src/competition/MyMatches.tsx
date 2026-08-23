import { staticDecode } from "@gi-tcg/assets-manager";
import { A } from "@solidjs/router";
import axios from "axios";
import {
  For,
  Show,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import type { TournamentGame, TournamentMatch } from "../api/models";
import { errorMessage } from "../api/errors";
import { useAuth } from "../auth";
import type { DeckInfoProps } from "../components/DeckBriefInfo";
import { RoomDialog } from "../components/RoomDialog";
import type { RoomInfo } from "../components/RoomInfo";
import { roomIdToCode } from "../utils";

interface TournamentJoinOptions {
  gameId: number;
  room: RoomInfo;
  decks: {
    id: number;
    sourceDeckId?: number | null;
    name: string;
    code: string;
    requiredVersion: number;
    deckJson?: { characters: number[]; cards: number[] };
    usable?: boolean;
  }[];
}

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
  const user = () => {
    const current = auth.status();
    return current.type === "user" ? current : null;
  };
  const matchUserId = () =>
    user()?.competitionStatus === "PLAYER" ? user()!.id : false;
  const [matches, { refetch }] = createResource(matchUserId, () =>
    axios
      .get<TournamentMatch[]>("users/me/matches")
      .then((response) => response.data),
  );
  const [joiningGameId, setJoiningGameId] = createSignal<number | null>(null);
  const [tournamentJoin, setTournamentJoin] =
    createSignal<TournamentJoinOptions>();
  let tournamentRoomDialogEl!: HTMLDialogElement;
  const enterGame = async (gameId: number) => {
    setJoiningGameId(gameId);
    try {
      const { data } = await axios.get<TournamentJoinOptions>(
        `tournament-games/${gameId}/join-options`,
      );
      setTournamentJoin(data);
      tournamentRoomDialogEl.showModal();
    } catch (reason) {
      alert(errorMessage(reason));
    } finally {
      setJoiningGameId(null);
    }
  };
  let timer: number | undefined;
  onMount(
    () =>
      (timer = window.setInterval(
        () =>
          document.visibilityState === "visible" &&
          matchUserId() !== false &&
          refetch(),
        5000,
      )),
  );
  onCleanup(() => timer && clearInterval(timer));
  const me = () => user()?.id ?? null;

  const tournamentDecks = (): (DeckInfoProps & { usable?: boolean })[] =>
    (tournamentJoin()?.decks ?? []).map((deck) => ({
      id: deck.sourceDeckId ?? deck.id,
      name: deck.name,
      code: deck.code,
      requiredVersion: deck.requiredVersion,
      usable: deck.usable,
      ...(deck.deckJson ?? staticDecode(deck.code)),
    }));

  return (
    <>
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
              fallback={<p class="text-gray-5">暂无比赛</p>}
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
                const winnerUserId = (
                  game: TournamentGame,
                  who: number | null,
                ) =>
                  who === null
                    ? null
                    : (game.players.find((player) => player.who === who)
                        ?.userId ?? null);
                const resultText = (game: TournamentGame) => {
                  const adjudicated = game.manualWinnerWho !== null;
                  const userId = winnerUserId(
                    game,
                    adjudicated ? game.manualWinnerWho : game.winnerWho,
                  );
                  if (userId === null) {
                    return adjudicated ? "裁定结果未知" : "对局结果未知";
                  }
                  return `${adjudicated ? "裁定" : "对局"}${
                    userId === me() ? "胜利" : "失败"
                  }`;
                };
                const resultColor = (game: TournamentGame) => {
                  const userId = winnerUserId(
                    game,
                    game.manualWinnerWho ?? game.winnerWho,
                  );
                  if (userId === null) return "text-gray-5";
                  return userId === me() ? "text-green-7" : "text-red-7";
                };
                return (
                  <article class="rounded-xl b b-purple-5 bg-purple-1/50 p-4">
                    <div class="flex items-start justify-between gap-3">
                      <h4 class="min-w-0 font-bold">
                        {match.event?.name ?? `场次 #${match.eventId}`}
                      </h4>
                      <span class="text-right text-sm text-gray-5">
                        {match.scheduledStart
                          ? new Date(match.scheduledStart).toLocaleString()
                          : "未指定"}{" "}
                        —{" "}
                        {match.scheduledEnd
                          ? new Date(match.scheduledEnd).toLocaleString()
                          : "未指定"}
                      </span>
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                      <span class="badge badge-soft-warning">
                        {phaseLabel[match.event?.phase ?? "RUNNING"]}
                      </span>
                      <span class="badge badge-soft-primary">
                        {modeLabel[match.mode]}
                      </span>
                      <span class="badge badge-soft-success">
                        {match.maxGames} 局 {match.winsRequired} 胜
                      </span>
                    </div>
                    <div class="mt-2 flex items-center justify-between gap-3">
                      <div class="min-w-0 flex flex-col items-start">
                        <span class="min-w-0 text-xs text-gray-5">对手</span>
                        <button
                          type="button"
                          class="bg-transparent p-0 font-medium hover:text-blue-6 hover:underline disabled:text-inherit disabled:no-underline"
                          disabled={!opponent()?.user.qq}
                          title={opponent()?.user.qq}
                          onClick={() =>
                            void navigator.clipboard.writeText(
                              opponent()?.user.qq ?? "",
                            )
                          }
                        >
                          {opponent()?.user.name ?? "轮空"}
                        </button>
                      </div>
                      <div class="min-w-0 flex flex-col items-end">
                        <span class="min-w-0 text-xs text-gray-5">比分</span>
                        <span class="shrink-0 font-bold tabular-nums">
                          {wins(me())} : {wins(opponent()?.userId ?? null)}
                        </span>
                      </div>
                    </div>
                    <ul class="flex flex-col">
                      <For each={match.games}>
                        {(game, index) => (
                          <li class="flex items-center justify-between b-t-1 b-purple-3 mt-1 pt-1">
                            <div>
                              <span class="font-bold">第 {index() + 1} 局</span>{" "}
                              <span class="text-sm">
                                {game.status === "FINISHED"
                                  ? "已结束"
                                  : game.runtimeStatus === "PLAYING"
                                    ? "进行中"
                                    : game.runtimeStatus === "FINALIZING"
                                      ? "结算中"
                                      : game.runtimeStatus === "WAITING"
                                        ? "等待对手"
                                        : "未开始"}
                              </span>
                            </div>
                            <Show when={game.status === "FINISHED"}>
                              <span
                                class={`ml-2 text-sm font-bold ${resultColor(game)}`}
                              >
                                {resultText(game)}
                              </span>
                            </Show>
                            <Show
                              when={
                                game.status === "PENDING" &&
                                game.runtimeStatus !== "FINALIZING"
                              }
                            >
                              {game.runtimeStatus === "PLAYING" &&
                              typeof game.roomId === "number" ? (
                                <A
                                  class="btn btn-solid-purple/50 h-6 py-0"
                                  href={`/rooms/${roomIdToCode(game.roomId)}?player=${user()!.id}&action=1`}
                                >
                                  继续对局
                                </A>
                              ) : (
                                <button
                                  class="btn btn-solid-purple/50 h-6 py-0"
                                  disabled={joiningGameId() === game.id}
                                  onClick={() => enterGame(game.id)}
                                >
                                  {joiningGameId() === game.id
                                    ? "加载中…"
                                    : "进入"}
                                </button>
                              )}
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
      <Portal>
        <RoomDialog
          ref={tournamentRoomDialogEl!}
          joiningRoomInfo={tournamentJoin()?.room}
          tournamentGameInfo={
            tournamentJoin() && {
              id: tournamentJoin()!.gameId,
              decks: tournamentDecks(),
            }
          }
        />
      </Portal>
    </>
  );
}
