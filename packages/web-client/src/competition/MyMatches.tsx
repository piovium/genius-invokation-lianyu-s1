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
import type { TournamentMatch } from "../api/models";
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
                          <li class="not-first:border-t-gray-2 flex items-center justify-between">
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
                            <Show
                              when={
                                game.status === "PENDING" &&
                                game.runtimeStatus !== "FINALIZING"
                              }
                            >
                              {game.runtimeStatus === "PLAYING" &&
                              typeof game.roomId === "number" ? (
                                <A
                                  class="btn btn-outline-primary"
                                  href={`/rooms/${roomIdToCode(game.roomId)}?player=${user()!.id}&action=1`}
                                >
                                  继续对局
                                </A>
                              ) : (
                                <button
                                  class="btn btn-outline-primary"
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
