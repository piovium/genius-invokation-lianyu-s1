import axios from "axios";
import {
  For,
  Show,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { useParams } from "@solidjs/router";
import type {
  Participant,
  TournamentGame,
  TournamentMatch,
} from "../../api/models";
import type { DeckInfo } from "../Decks";
import { errorMessage } from "../../api/errors";
import { AdminPage, fmt, modeLabel, phaseLabel } from "./shared";

function DeckAssignment(props: {
  match: TournamentMatch;
  participant: Participant;
  onDone: () => void;
}) {
  const [decks] = createResource<DeckInfo[]>(() =>
    axios
      .get(`admin/users/${props.participant.userId}/decks`)
      .then((r) => r.data.data),
  );
  const [selected, setSelected] = createSignal<number | null>(null);
  const [busy, setBusy] = createSignal(false);
  const assign = async () => {
    if (selected() === null) return;
    const reason = prompt("指定比赛牌组的原因");
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await axios.put(
        `admin/matches/${props.match.id}/participants/${props.participant.userId}/decks`,
        { deckId: selected(), reason: reason.trim() },
      );
      props.onDone();
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="rounded-lg b b-gray-2 p-3">
      <b>{props.participant.user.name}</b>
      <p class="text-sm text-gray-5 mb-2">
        当前比赛牌组{" "}
        {
          props.match.matchDecks.filter(
            (d) => d.userId === props.participant.userId,
          ).length
        }{" "}
        个
      </p>
      <div class="flex gap-2">
        <select
          class="select min-w-0 flex-1"
          value={selected() ?? ""}
          onChange={(e) => setSelected(Number(e.currentTarget.value))}
        >
          <option value="" disabled>
            选择用户牌组
          </option>
          <For each={decks()}>
            {(deck) => <option value={deck.id}>{deck.name}</option>}
          </For>
        </select>
        <button
          class="btn btn-outline-primary"
          disabled={
            busy() ||
            selected() === null ||
            props.match.event?.phase === "FINISHED"
          }
          onClick={assign}
        >
          指定
        </button>
      </div>
    </div>
  );
}

export default function AdminMatch() {
  const params = useParams();
  const [match, { refetch }] = createResource<TournamentMatch>(() =>
    axios.get(`admin/matches/${params.id}`).then((r) => r.data),
  );
  const [message, setMessage] = createSignal("");
  const [selectedGame, setSelectedGame] = createSignal<TournamentGame | null>(
    null,
  );
  const [busy, setBusy] = createSignal(false);
  let timer: number | undefined;
  onMount(
    () =>
      (timer = window.setInterval(
        () =>
          document.visibilityState === "visible" &&
          match()?.games.some((g) => g.status === "PENDING") &&
          refetch(),
        3000,
      )),
  );
  onCleanup(() => timer && clearInterval(timer));
  const act = async (
    url: string,
    body: Record<string, unknown>,
    success: string,
  ) => {
    setBusy(true);
    setMessage("");
    try {
      await axios.post(url, body);
      setMessage(success);
      refetch();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const reasonAction = (url: string, success: string) => {
    const reason = prompt("请输入操作原因");
    if (reason?.trim()) act(url, { reason: reason.trim() }, success);
  };
  const toggleAuto = async () => {
    const data = match();
    if (!data) return;
    const reason = prompt("修改自动开局的原因");
    if (!reason?.trim()) return;
    try {
      await axios.patch(`admin/matches/${data.id}`, {
        autoCreateGame: !data.autoCreateGame,
        reason: reason.trim(),
      });
      refetch();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };
  const editMatch = async () => {
    const data = match();
    if (!data || data.event?.phase === "FINISHED") return;
    const maxGames = prompt("总局数", String(data.maxGames));
    if (maxGames === null) return;
    const winsRequired = prompt("胜局数", String(data.winsRequired));
    if (winsRequired === null) return;
    const mode = prompt("模式：UNRESTRICTED / DUEL / CONQUEST", data.mode);
    if (!mode) return;
    const roomConfig = prompt("房间配置 JSON", JSON.stringify(data.roomConfig));
    if (roomConfig === null) return;
    const reason = prompt("修改原因");
    if (!reason?.trim()) return;
    try {
      await axios.patch(`admin/matches/${data.id}`, {
        maxGames: Number(maxGames),
        winsRequired: Number(winsRequired),
        mode,
        roomConfig: JSON.parse(roomConfig),
        reason: reason.trim(),
      });
      refetch();
      setMessage("盘次配置已更新。");
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };
  const setWinner = async () => {
    const data = match();
    if (!data) return;
    const value = prompt(
      `输入赢家用户 ID；留空清除。候选：${data.participants.map((p) => `${p.user.name}=${p.userId}`).join("，")}`,
      data.winnerUserId ? String(data.winnerUserId) : "",
    );
    if (value === null) return;
    const reason = prompt("介入原因");
    if (!reason?.trim()) return;
    try {
      await axios.patch(`admin/matches/${data.id}/intervention`, {
        winnerUserId: value.trim() ? Number(value) : null,
        reason: reason.trim(),
      });
      refetch();
      setMessage("盘次赢家已裁定，自动创建新局已关闭。");
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const intervene = async (event: SubmitEvent) => {
    event.preventDefault();
    const game = selectedGame();
    if (!game) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    setBusy(true);
    try {
      const manual = String(form.get("manualWinnerWho"));
      await axios.patch(`admin/games/${game.id}/intervention`, {
        status: String(form.get("status")),
        manualWinnerWho: manual === "" ? null : Number(manual),
        countForStats: form.get("countForStats") === "on",
        reason: String(form.get("reason")),
      });
      setSelectedGame(null);
      setMessage(
        "介入完成；本盘自动创建已关闭，已耗尽牌组不会恢复，其它对局不受影响。",
      );
      refetch();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const downloadLog = (game: TournamentGame) => {
    const blob = new Blob([JSON.stringify(game.stateLog, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `game-${game.id}-state-log.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminPage
      title={`盘次 #${params.id}`}
      actions={
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-outline"
            disabled={!match() || match()?.event?.phase === "FINISHED"}
            onClick={editMatch}
          >
            编辑盘次配置
          </button>
          <button
            class="btn btn-outline"
            disabled={
              !match() ||
              match()?.event?.phase !== "RUNNING" ||
              match()?.winnerUserId !== null
            }
            onClick={() =>
              reasonAction(`admin/matches/${params.id}/games`, "已创建新局。")
            }
          >
            创建新局
          </button>
          <button
            class="btn btn-outline"
            disabled={
              match()?.participants.filter((p) => p.status === "ACTIVE")
                .length !== 1
            }
            onClick={() =>
              reasonAction(
                `admin/matches/${params.id}/auto-win`,
                "轮空选手已自动获胜。",
              )
            }
          >
            轮空胜利
          </button>
          <button class="btn btn-outline-warning" onClick={setWinner}>
            裁定盘次赢家
          </button>
        </div>
      }
    >
      <Show when={message()}>
        <div class="alert alert-border-info mb-3">{message()}</div>
      </Show>
      <Show when={match()}>
        {(data) => (
          <>
            <section class="rounded-xl b b-gray-2 p-4 mb-4">
              <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <small>场次</small>
                  <p>{data().event?.name}</p>
                </div>
                <div>
                  <small>阶段</small>
                  <p>{data().event ? phaseLabel[data().event!.phase] : "—"}</p>
                </div>
                <div>
                  <small>模式</small>
                  <p>{modeLabel[data().mode]}</p>
                </div>
                <div>
                  <small>赛制</small>
                  <p>
                    {data().maxGames} 局 {data().winsRequired} 胜
                  </p>
                </div>
                <div>
                  <small>日程</small>
                  <p>
                    {fmt(data().scheduledStart)}
                    <br />
                    {fmt(data().scheduledEnd)}
                  </p>
                </div>
              </div>
              <div class="mt-3 flex items-center gap-3">
                <span>
                  自动创建新局：<b>{data().autoCreateGame ? "开启" : "关闭"}</b>
                </span>
                <button
                  class="btn btn-ghost-primary"
                  disabled={data().event?.phase === "FINISHED"}
                  onClick={toggleAuto}
                >
                  切换
                </button>
                <Show when={data().winnerUserId}>
                  <span class="badge badge-soft-success">
                    赢家：
                    {
                      data().participants.find(
                        (p) => p.userId === data().winnerUserId,
                      )?.user.name
                    }
                  </span>
                </Show>
              </div>
            </section>
            <h3 class="font-bold text-lg mb-2">双方牌组</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
              <For each={data().participants}>
                {(participant) => (
                  <DeckAssignment
                    match={data()}
                    participant={participant}
                    onDone={() => refetch()}
                  />
                )}
              </For>
            </div>
            <h3 class="font-bold text-lg mb-2">对局列表</h3>
            <div class="overflow-x-auto">
              <table class="table w-full">
                <thead>
                  <tr>
                    <th>对局</th>
                    <th>状态</th>
                    <th>先后手 / 牌组</th>
                    <th>原始 / 裁定赢家</th>
                    <th>结束原因</th>
                    <th>回合数</th>
                    <th>计入统计</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={data().games}>
                    {(game) => (
                      <tr>
                        <td>
                          #{game.id}
                          <br />
                          <small>{fmt(game.createdAt)}</small>
                        </td>
                        <td>
                          {game.status === "PENDING"
                            ? game.startedAt
                              ? "进行中（内存）"
                              : "未开始"
                            : "已结束"}
                        </td>
                        <td>
                          <For each={game.players}>
                            {(player) => (
                              <div>
                                玩家 {player.who}：
                                {data().participants.find(
                                  (p) => p.userId === player.userId,
                                )?.user.name ?? "—"}{" "}
                                / {player.deckName ?? "未选牌组"}
                              </div>
                            )}
                          </For>
                        </td>
                        <td>
                          {game.winnerWho ?? "—"} /{" "}
                          {game.manualWinnerWho ?? "—"}
                        </td>
                        <td>{game.endReason ?? "—"}</td>
                        <td>{game.roundCount ?? "—"}</td>
                        <td>{game.countForStats ? "是" : "否"}</td>
                        <td>
                          <button
                            class="text-orange-6 mr-3"
                            onClick={() => setSelectedGame(game)}
                          >
                            管理员介入
                          </button>
                          <Show when={game.stateLog}>
                            <button
                              class="text-blue-6"
                              onClick={() => downloadLog(game)}
                            >
                              日志
                            </button>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </>
        )}
      </Show>
      <Show when={selectedGame()}>
        {(game) => (
          <div class="fixed inset-0 z-300 bg-black/40 flex items-center justify-center p-4">
            <form
              class="bg-white rounded-xl p-5 w-full max-w-110"
              onSubmit={intervene}
            >
              <h3 class="text-xl font-bold">介入对局 #{game().id}</h3>
              <Show when={game().status === "PENDING" && game().startedAt}>
                <div class="alert alert-border-warning my-3">
                  该局可能正在运行，提交将立即中止双方当前游戏。
                </div>
              </Show>
              <label class="flex flex-col gap-1 mt-3">
                <span>目标状态</span>
                <select name="status" class="select" value={game().status}>
                  <option value="PENDING">未开始</option>
                  <option value="FINISHED">已结束</option>
                </select>
              </label>
              <label class="flex flex-col gap-1 mt-3">
                <span>手动赢家</span>
                <select
                  name="manualWinnerWho"
                  class="select"
                  value={game().manualWinnerWho ?? ""}
                >
                  <option value="">无</option>
                  <option value="0">玩家 0</option>
                  <option value="1">玩家 1</option>
                </select>
              </label>
              <label class="flex gap-2 mt-3">
                <input
                  name="countForStats"
                  type="checkbox"
                  checked={game().countForStats}
                />{" "}
                计入业务统计
              </label>
              <label class="flex flex-col gap-1 mt-3">
                <span>介入原因</span>
                <textarea
                  name="reason"
                  class="textarea textarea-solid"
                  maxlength={500}
                  required
                />
              </label>
              <div class="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  class="btn btn-ghost"
                  onClick={() => setSelectedGame(null)}
                >
                  取消
                </button>
                <button class="btn btn-solid-error" disabled={busy()}>
                  确认介入
                </button>
              </div>
            </form>
          </div>
        )}
      </Show>
    </AdminPage>
  );
}
