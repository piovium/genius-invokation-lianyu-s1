import { useNavigate, useParams } from "@solidjs/router";
import axios from "axios";
import {
  For,
  Match,
  Show,
  Switch,
  createResource,
  createSignal,
} from "solid-js";
import type { TournamentEvent } from "../../api/models";
import { errorMessage } from "../../api/errors";
import { useI18n } from "../../i18n";
import { AdminPage, fmt, modeLabel, phaseLabel } from "./shared";

const fmtSchedule = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

export default function AdminEvent() {
  const params = useParams();
  const navigate = useNavigate();
  const { assetsManager } = useI18n();
  const [event, { refetch }] = createResource<TournamentEvent>(() =>
    axios.get(`admin/events/${params.id}`).then((r) => r.data),
  );
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [renaming, setRenaming] = createSignal(false);
  const [renameError, setRenameError] = createSignal("");
  const [editingDeckLimit, setEditingDeckLimit] = createSignal(false);
  const [deckLimitError, setDeckLimitError] = createSignal("");
  const advance = async () => {
    const current = event();
    if (!current) return;
    const next = current.phase === "DECK_COLLECTION" ? "进行中" : "已结束";
    const impact =
      current.matches
        ?.flatMap((m) => m.games)
        .filter((g) => g.status === "PENDING").length ?? 0;
    if (
      !confirm(
        current.phase === "DECK_COLLECTION"
          ? `步进至${next}？比赛牌组将固化，并为开启自动创建的盘次开局。`
          : `结束场次？${impact} 个开放对局将关闭且比赛牌组将清除。`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await axios.post(`admin/events/${params.id}/advance`, {});
      setMessage(`场次已步进至${next}。`);
      refetch();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const rename = async (submitEvent: SubmitEvent) => {
    submitEvent.preventDefault();
    const current = event();
    if (!current) return;
    const form = new FormData(submitEvent.currentTarget as HTMLFormElement);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setRenameError("场次名称不能为空。");
      return;
    }
    setBusy(true);
    setRenameError("");
    try {
      await axios.patch(`admin/events/${current.id}`, {
        name,
      });
      setRenaming(false);
      setMessage("场次已重命名。");
      refetch();
    } catch (e) {
      setRenameError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const editDeckLimit = async (submitEvent: SubmitEvent) => {
    submitEvent.preventDefault();
    const current = event();
    if (!current) return;
    const form = new FormData(submitEvent.currentTarget as HTMLFormElement);
    const deckLimit = Number(form.get("deckLimit"));
    if (!Number.isInteger(deckLimit) || deckLimit < 0 || deckLimit > 100) {
      setDeckLimitError("牌组上限必须是 0 到 100 之间的整数。");
      return;
    }
    setBusy(true);
    setDeckLimitError("");
    try {
      await axios.patch(`admin/events/${current.id}`, {
        deckLimit,
      });
      setEditingDeckLimit(false);
      setMessage("牌组上限已修改。");
      refetch();
    } catch (e) {
      setDeckLimitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const exportJson = async () => {
    try {
      const { data } = await axios.get(`admin/events/${params.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `event-${params.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  return (
    <AdminPage
      title={event()?.name ?? "场次详情"}
      breadcrumbs={[{ title: "比赛场次", href: "/admin/events" }]}
      titleActions={
        <button
          class="btn btn-ghost-primary h-8 w-8 p-0"
          title="重命名场次"
          aria-label="重命名场次"
          disabled={!event() || event()?.phase === "FINISHED"}
          onClick={() => {
            setRenameError("");
            setRenaming(true);
          }}
        >
          <i class="i-mdi-square-edit-outline text-lg" />
        </button>
      }
      actions={
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-outline" onClick={exportJson}>
            导出 JSON
          </button>
          <button
            class="btn btn-solid-primary"
            disabled={busy() || event()?.phase === "FINISHED"}
            onClick={advance}
          >
            <Switch>
              <Match when={event()?.phase === "DECK_COLLECTION"}>
                开始场次
              </Match>
              <Match when={event()?.phase === "RUNNING"}>结束场次</Match>
              <Match when={true}>已结束</Match>
            </Switch>
          </button>
        </div>
      }
    >
      <Show when={message()}>
        <div class="alert alert-border-info mb-3">
          <p>{message()}</p>
        </div>
      </Show>
      <Show when={event()}>
        {(data) => (
          <>
            <section class="rounded-xl b b-gray-2 p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <small class="text-gray-5">阶段</small>
                <p>
                  <span class="badge badge-soft-primary">
                    {phaseLabel[data().phase]}
                  </span>
                </p>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <small class="text-gray-5">牌组上限</small>
                  <button
                    class="btn btn-ghost-primary h-6 w-6 p-0"
                    title="修改牌组上限"
                    aria-label="修改牌组上限"
                    disabled={data().phase !== "DECK_COLLECTION"}
                    onClick={() => {
                      setDeckLimitError("");
                      setEditingDeckLimit(true);
                    }}
                  >
                    <i class="i-mdi-square-edit-outline text-base" />
                  </button>
                </div>
                <p>{data().deckLimit || "不限"}</p>
              </div>
              <div>
                <small class="text-gray-5">盘次</small>
                <p>{data().matches?.length ?? 0}</p>
              </div>
              <div>
                <small class="text-gray-5">创建时间</small>
                <p>{fmt(data().createdAt)}</p>
              </div>
            </section>
            <div class="overflow-x-auto table-root">
              <table class="table w-full">
                <thead class="table-header">
                  <tr class="table-row">
                    <th class="table-head">盘次</th>
                    <th class="table-head">双方选手</th>
                    <th class="table-head">比赛牌组</th>
                    <th class="table-head">日程</th>
                    <th class="table-head">赛制</th>
                    <th class="table-head">比分</th>
                    <th class="table-head">赢家</th>
                  </tr>
                </thead>
                <tbody class="table-body">
                  <For each={data().matches}>
                    {(match) => {
                      const player = (who: number) =>
                        match.participants.find((p) => p.who === who);
                      const decks = (who: number) => {
                        const userId = player(who)?.userId;
                        return userId === undefined
                          ? []
                          : match.matchDecks.filter(
                              (deck) => deck.userId === userId,
                            );
                      };
                      const wins = (userId?: number) =>
                        match.games.filter((game) => {
                          const who = game.manualWinnerWho ?? game.winnerWho;
                          return (
                            game.status === "FINISHED" &&
                            game.players.find((p) => p.who === who)?.userId ===
                              userId
                          );
                        }).length;
                      return (
                        <tr
                          class="table-row cursor-pointer hover:bg-blue-50"
                          role="link"
                          tabindex="0"
                          aria-label={`查看盘次 #${match.id}`}
                          onClick={() => navigate(`/admin/matches/${match.id}`)}
                          onKeyDown={(keyEvent) => {
                            if (keyEvent.target !== keyEvent.currentTarget) return;
                            if (
                              keyEvent.key === "Enter" ||
                              keyEvent.key === " "
                            ) {
                              keyEvent.preventDefault();
                              navigate(`/admin/matches/${match.id}`);
                            }
                          }}
                        >
                          <td class="table-cell">
                            <span class="text-blue-6 font-bold">
                              #{match.id}
                            </span>
                          </td>
                          <td class="table-cell">
                            <div>{player(0)?.user.name ?? "轮空"}</div>
                            <div>{player(1)?.user.name ?? "轮空"}</div>
                            <Show
                              when={match.participants.some(
                                (p) => p.status === "WITHDRAWN",
                              )}
                            >
                              <span class="badge badge-soft-error ml-2">
                                有退赛
                              </span>
                            </Show>
                          </td>
                          <td class="table-cell min-w-52">
                            <For each={[0, 1]}>
                              {(who) => (
                                <div class="mb-1 last:mb-0 flex items-center gap-1">
                                  <Show
                                    when={player(who)}
                                    fallback={
                                      <span class="text-sm text-gray-4">轮空</span>
                                    }
                                  >
                                    <For
                                      each={decks(who)}
                                      fallback={
                                        <span class="text-sm text-gray-4">
                                          未设置
                                        </span>
                                      }
                                    >
                                      {(deck) => (
                                        <button
                                          type="button"
                                          class="flex items-center rounded-full bg-gray-3 p-0.5 hover:bg-purple-2"
                                          classList={{
                                            "grayscale opacity-50": !deck.usable,
                                          }}
                                          title={
                                            deck.disableReason
                                              ? `${deck.disableReason}；点击复制分享码`
                                              : "点击复制分享码"
                                          }
                                          aria-label="复制牌组分享码"
                                          onClick={(clickEvent) => {
                                            clickEvent.stopPropagation();
                                            void navigator.clipboard.writeText(
                                              deck.code,
                                            );
                                          }}
                                        >
                                          <For each={deck.deckJson.characters}>
                                            {(characterId) => (
                                              <img
                                                class="h-7 w-7 rounded-full b b-purple-3 object-cover"
                                                src={assetsManager().getImageUrlSync(
                                                  characterId,
                                                  { type: "icon" },
                                                )}
                                                alt={
                                                  assetsManager().getNameSync(
                                                    characterId,
                                                  ) ?? String(characterId)
                                                }
                                                title={
                                                  assetsManager().getNameSync(
                                                    characterId,
                                                  ) ?? String(characterId)
                                                }
                                              />
                                            )}
                                          </For>
                                        </button>
                                      )}
                                    </For>
                                  </Show>
                                </div>
                              )}
                            </For>
                          </td>
                          <td class="table-cell">
                            <div>开始 {fmtSchedule(match.scheduledStart)}</div>
                            <div>结束 {fmtSchedule(match.scheduledEnd)}</div>
                          </td>
                          <td class="table-cell">
                            <div>{modeLabel[match.mode]}</div>
                            <div>
                              {match.maxGames} 局 {match.winsRequired} 胜
                            </div>
                          </td>
                          <td class="table-cell">
                            {wins(player(0)?.userId)} :{" "}
                            {wins(player(1)?.userId)}
                          </td>
                          <td class="table-cell">
                            {match.participants.find(
                              (p) => p.userId === match.winnerUserId,
                            )?.user.name ?? "—"}
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </div>
          </>
        )}
      </Show>
      <Show when={renaming() && event()}>
        {(data) => (
          <div class="fixed inset-0 z-300 bg-black/40 flex items-center justify-center p-4">
            <form
              class="bg-white rounded-xl shadow-xl p-5 w-full max-w-110"
              onSubmit={rename}
            >
              <h3 class="text-xl font-bold">重命名场次</h3>
              <label class="flex flex-col md:flex-row md:items-center gap-1 mt-3">
                <span class="shrink-0">场次名称</span>
                <input
                  name="name"
                  class="input input-solid h-10 flex-1"
                  value={data().name}
                  maxlength={100}
                  autofocus
                  required
                />
              </label>
              <Show when={renameError()}>
                <div class="alert alert-border-error mt-3">
                  <p>{renameError()}</p>
                </div>
              </Show>
              <div class="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  class="btn btn-ghost"
                  disabled={busy()}
                  onClick={() => setRenaming(false)}
                >
                  取消
                </button>
                <button class="btn btn-solid-primary" disabled={busy()}>
                  {busy() ? "正在保存…" : "保存名称"}
                </button>
              </div>
            </form>
          </div>
        )}
      </Show>
      <Show when={editingDeckLimit() && event()}>
        {(data) => (
          <div class="fixed inset-0 z-300 bg-black/40 flex items-center justify-center p-4">
            <form
              class="bg-white rounded-xl shadow-xl p-5 w-full max-w-110"
              onSubmit={editDeckLimit}
            >
              <h3 class="text-xl font-bold">修改牌组上限</h3>
              <label class="flex flex-col md:flex-row md:items-center gap-1 mt-3">
                <span class="shrink-0">牌组上限（0 不限）</span>
                <input
                  name="deckLimit"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  class="input input-solid h-10 flex-1"
                  value={data().deckLimit}
                  autofocus
                  required
                />
              </label>
              <Show when={deckLimitError()}>
                <div class="alert alert-border-error mt-3">
                  <p>{deckLimitError()}</p>
                </div>
              </Show>
              <div class="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  class="btn btn-ghost"
                  disabled={busy()}
                  onClick={() => setEditingDeckLimit(false)}
                >
                  取消
                </button>
                <button class="btn btn-solid-primary" disabled={busy()}>
                  {busy() ? "正在保存…" : "保存上限"}
                </button>
              </div>
            </form>
          </div>
        )}
      </Show>
    </AdminPage>
  );
}
