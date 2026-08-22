import { A, useParams } from "@solidjs/router";
import axios from "axios";
import { For, Show, createResource, createSignal } from "solid-js";
import type { TournamentEvent } from "../../api/models";
import { errorMessage } from "../../api/errors";
import { AdminPage, fmt, modeLabel, phaseLabel } from "./shared";

export default function AdminEvent() {
  const params = useParams();
  const [event, { refetch }] = createResource<TournamentEvent>(() =>
    axios.get(`admin/events/${params.id}`).then((r) => r.data),
  );
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
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
    const reason = prompt("请输入操作原因（审计必填）");
    if (!reason?.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await axios.post(`admin/events/${params.id}/advance`, {
        reason: reason.trim(),
      });
      setMessage(`场次已步进至${next}。`);
      refetch();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const edit = async () => {
    const current = event();
    if (!current) return;
    const name = prompt("场次名称", current.name);
    if (!name?.trim()) return;
    const deckLimit =
      current.phase === "DECK_COLLECTION"
        ? Number(prompt("牌组上限（0 不限）", String(current.deckLimit)))
        : undefined;
    const reason = prompt("修改原因（审计必填）");
    if (!reason?.trim()) return;
    try {
      await axios.patch(`admin/events/${current.id}`, {
        name: name.trim(),
        deckLimit,
        reason: reason.trim(),
      });
      refetch();
    } catch (e) {
      setMessage(errorMessage(e));
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
      actions={
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-outline"
            disabled={!event() || event()?.phase === "FINISHED"}
            onClick={edit}
          >
            编辑
          </button>
          <button class="btn btn-outline" onClick={exportJson}>
            导出 JSON
          </button>
          <button
            class="btn btn-solid-primary"
            disabled={busy() || event()?.phase === "FINISHED"}
            onClick={advance}
          >
            步进阶段
          </button>
        </div>
      }
    >
      <Show when={message()}>
        <div class="alert alert-border-info mb-3">{message()}</div>
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
                <small class="text-gray-5">牌组上限</small>
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
            <div class="overflow-x-auto">
              <table class="table w-full">
                <thead>
                  <tr>
                    <th>盘次</th>
                    <th>双方选手</th>
                    <th>日程</th>
                    <th>模式 / 赛制</th>
                    <th>比分</th>
                    <th>赢家</th>
                    <th>开放局</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={data().matches}>
                    {(match) => {
                      const player = (who: number) =>
                        match.participants.find((p) => p.who === who);
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
                        <tr>
                          <td>
                            <A
                              class="text-blue-6 font-bold"
                              href={`/admin/matches/${match.id}`}
                            >
                              #{match.id}
                            </A>
                          </td>
                          <td>
                            {player(0)?.user.name ?? "轮空"} vs{" "}
                            {player(1)?.user.name ?? "轮空"}
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
                          <td>
                            {fmt(match.scheduledStart)}
                            <br />
                            <small>至 {fmt(match.scheduledEnd)}</small>
                          </td>
                          <td>
                            {modeLabel[match.mode]} · {match.maxGames} 局{" "}
                            {match.winsRequired} 胜
                          </td>
                          <td>
                            {wins(player(0)?.userId)} :{" "}
                            {wins(player(1)?.userId)}
                          </td>
                          <td>
                            {match.participants.find(
                              (p) => p.userId === match.winnerUserId,
                            )?.user.name ?? "—"}
                          </td>
                          <td>
                            {
                              match.games.filter((g) => g.status === "PENDING")
                                .length
                            }
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
    </AdminPage>
  );
}
