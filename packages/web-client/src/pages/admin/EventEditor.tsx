import { useNavigate } from "@solidjs/router";
import axios from "axios";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import type {
  AdminUser,
  EventPhase,
  MatchMode,
  Ranking,
  TournamentEvent,
} from "../../api/models";
import { errorMessage, apiProblem } from "../../api/errors";
import { AdminPage } from "./shared";

function move(ids: number[], index: number, offset: number) {
  const next = [...ids];
  const target = index + offset;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
function shuffle(ids: number[]) {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

export default function EventEditor() {
  const navigate = useNavigate();
  const [users] = createResource<AdminUser[]>(() =>
    axios
      .get("admin/users", { params: { status: "PLAYER" } })
      .then((r) => r.data),
  );
  const [events] = createResource<TournamentEvent[]>(() =>
    axios.get("admin/events").then((r) => r.data),
  );
  const [historyIds, setHistoryIds] = createSignal<number[]>([]);
  const [rankings] = createResource(historyIds, (ids) =>
    ids.length
      ? axios
          .post<Ranking[]>("admin/rankings/preview", { eventIds: ids })
          .then((r) => r.data)
      : Promise.resolve([]),
  );
  const [side0, setSide0] = createSignal<number[]>([]);
  const [side1, setSide1] = createSignal<number[]>([]);
  const [checked, setChecked] = createSignal<number[]>([]);
  const [search, setSearch] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const candidates = createMemo(() => {
    const query = search().trim().toLowerCase();
    const rank = new Map((rankings() ?? []).map((r) => [r.userId, r]));
    let result = (users() ?? []).filter(
      (u) =>
        !u.activeMatchId &&
        (!query ||
          u.name.toLowerCase().includes(query) ||
          u.qq.includes(query)),
    );
    if (historyIds().length)
      result = result
        .filter((u) => rank.has(u.id))
        .sort(
          (a, b) =>
            (rank.get(a.id)?.rank ?? 9999) - (rank.get(b.id)?.rank ?? 9999),
        );
    return result;
  });
  const user = (id: number) => users()?.find((item) => item.id === id);
  const add = (side: 0 | 1, ids: number[]) => {
    const occupied = new Set([...side0(), ...side1()]);
    const fresh = ids.filter((id) => !occupied.has(id));
    if (side === 0) setSide0([...side0(), ...fresh]);
    else setSide1([...side1(), ...fresh]);
    setChecked([]);
  };
  const remove = (side: 0 | 1, id: number) =>
    side === 0
      ? setSide0(side0().filter((x) => x !== id))
      : setSide1(side1().filter((x) => x !== id));

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!side0().length && !side1().length) {
      setError("请至少选择一位参赛选手");
      return;
    }
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const maxGames = Number(form.get("maxGames")),
      winsRequired = Number(form.get("winsRequired"));
    if (maxGames < winsRequired) {
      setError("总局数必须大于等于胜局数");
      return;
    }
    const pairs = Math.max(side0().length, side1().length),
      byes = Math.abs(side0().length - side1().length);
    if (
      !confirm(
        `确认创建 ${pairs} 盘（双人 ${pairs - byes}、轮空 ${byes}），共 ${side0().length + side1().length} 位选手？`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const roomConfigText = String(form.get("roomConfig") || "{}");
      const { data } = await axios.post<{ id: number }>("admin/events", {
        event: {
          name: String(form.get("name")),
          initialPhase: String(form.get("initialPhase")) as EventPhase,
          deckLimit: Number(form.get("deckLimit")),
        },
        matchTemplate: {
          scheduledStart: form.get("scheduledStart")
            ? new Date(String(form.get("scheduledStart"))).toISOString()
            : undefined,
          scheduledEnd: form.get("scheduledEnd")
            ? new Date(String(form.get("scheduledEnd"))).toISOString()
            : undefined,
          mode: String(form.get("mode")) as MatchMode,
          maxGames,
          winsRequired,
          autoCreateGame: form.get("autoCreateGame") === "on",
          roomConfig: JSON.parse(roomConfigText),
        },
        player0Ids: side0(),
        player1Ids: side1(),
      });
      navigate(`/admin/events/${data.id}`);
    } catch (reason) {
      const conflicts = apiProblem(reason)?.details?.userIds;
      if (Array.isArray(conflicts))
        setChecked(
          conflicts.filter((id): id is number => typeof id === "number"),
        );
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const side = (which: 0 | 1, ids: number[]) => (
    <div class="rounded-xl b b-gray-2 p-3">
      <div class="flex flex-wrap justify-between gap-2 mb-2">
        <h3 class="font-bold">
          玩家 {which} 列表（{ids.length}）
        </h3>
        <div class="flex gap-1">
          <button
            type="button"
            class="btn btn-ghost text-xs"
            onClick={() =>
              which === 0
                ? setSide0(shuffle(side0()))
                : setSide1(shuffle(side1()))
            }
          >
            洗牌
          </button>
          <button
            type="button"
            class="btn btn-ghost text-xs"
            onClick={() =>
              which === 0
                ? setSide0([...side0()].reverse())
                : setSide1([...side1()].reverse())
            }
          >
            倒序
          </button>
        </div>
      </div>
      <ol class="flex flex-col gap-1">
        <For each={ids}>
          {(id, index) => (
            <li class="rounded bg-gray-50 p-2 flex items-center gap-2">
              <span class="w-6 text-gray-5">{index() + 1}</span>
              <span class="flex-1">
                {user(id)?.name} <small>{user(id)?.qq}</small>
              </span>
              <button
                type="button"
                aria-label="上移"
                onClick={() =>
                  which === 0
                    ? setSide0(move(side0(), index(), -1))
                    : setSide1(move(side1(), index(), -1))
                }
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="下移"
                onClick={() =>
                  which === 0
                    ? setSide0(move(side0(), index(), 1))
                    : setSide1(move(side1(), index(), 1))
                }
              >
                ↓
              </button>
              <button
                type="button"
                class="text-red-6"
                aria-label="移除"
                onClick={() => remove(which, id)}
              >
                ×
              </button>
            </li>
          )}
        </For>
      </ol>
    </div>
  );

  return (
    <AdminPage title="创建场次">
      <form class="flex flex-col gap-5" onSubmit={submit}>
        <section class="rounded-xl b b-gray-2 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label class="flex flex-col gap-1 sm:col-span-2">
            <span>场次名称</span>
            <input
              name="name"
              class="input input-solid"
              maxlength={100}
              required
            />
          </label>
          <label class="flex flex-col gap-1">
            <span>初始阶段</span>
            <select name="initialPhase" class="select">
              <option value="DECK_COLLECTION">收集牌组中</option>
              <option value="RUNNING">进行中</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span>牌组上限（0 不限）</span>
            <input
              name="deckLimit"
              type="number"
              min="0"
              max="100"
              value="0"
              class="input input-solid"
              required
            />
          </label>
          <label class="flex flex-col gap-1">
            <span>总局数</span>
            <input
              name="maxGames"
              type="number"
              min="1"
              max="99"
              value="3"
              class="input input-solid"
              required
            />
          </label>
          <label class="flex flex-col gap-1">
            <span>胜局数</span>
            <input
              name="winsRequired"
              type="number"
              min="1"
              max="99"
              value="2"
              class="input input-solid"
              required
            />
          </label>
          <label class="flex flex-col gap-1">
            <span>对局模式</span>
            <select name="mode" class="select">
              <option value="UNRESTRICTED">无限制</option>
              <option value="DUEL">决斗</option>
              <option value="CONQUEST">征服</option>
            </select>
          </label>
          <label class="flex items-center gap-2">
            <input name="autoCreateGame" type="checkbox" /> 自动创建新局
          </label>
          <label class="flex flex-col gap-1">
            <span>预计开始</span>
            <input
              name="scheduledStart"
              type="datetime-local"
              class="input input-solid"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span>预计结束</span>
            <input
              name="scheduledEnd"
              type="datetime-local"
              class="input input-solid"
            />
          </label>
          <label class="flex flex-col gap-1 sm:col-span-2">
            <span>房间配置 JSON</span>
            <textarea
              name="roomConfig"
              class="textarea textarea-solid font-mono"
              rows="3"
            >
              {JSON.stringify({
                initTotalActionTime: 45,
                rerollTime: 40,
                roundTotalActionTime: 60,
                actionTime: 25,
                watchable: true,
              })}
            </textarea>
          </label>
        </section>
        <section>
          <h3 class="font-bold text-lg mb-2">配对顺序</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {side(0, side0())}
            {side(1, side1())}
          </div>
          <div class="mt-2 rounded-lg bg-amber-50 p-3 text-sm">
            按相同序号配对；当前将生成{" "}
            {Math.max(side0().length, side1().length)} 盘，其中轮空{" "}
            {Math.abs(side0().length - side1().length)} 盘。
          </div>
        </section>
        <section>
          <div class="flex flex-wrap gap-3 items-end mb-2">
            <h3 class="font-bold text-lg flex-1">候选参赛选手</h3>
            <input
              class="input input-solid"
              placeholder="搜索昵称或 QQ"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
          </div>
          <details class="rounded-lg b b-gray-2 p-3 mb-2">
            <summary class="cursor-pointer">根据历史场次筛选排序</summary>
            <div class="mt-2 flex flex-wrap gap-3">
              <For each={events()?.filter((e) => e.phase === "FINISHED")}>
                {(event) => (
                  <label>
                    <input
                      type="checkbox"
                      checked={historyIds().includes(event.id)}
                      onChange={(e) =>
                        setHistoryIds(
                          e.currentTarget.checked
                            ? [...historyIds(), event.id]
                            : historyIds().filter((id) => id !== event.id),
                        )
                      }
                    />{" "}
                    {event.name}
                  </label>
                )}
              </For>
            </div>
          </details>
          <div class="flex flex-wrap gap-2 mb-2">
            <button
              type="button"
              class="btn btn-outline"
              onClick={() =>
                setChecked(
                  candidates()
                    .filter(
                      (u) => !side0().includes(u.id) && !side1().includes(u.id),
                    )
                    .map((u) => u.id),
                )
              }
            >
              全选当前结果
            </button>
            <button
              type="button"
              class="btn btn-outline-primary"
              disabled={!checked().length}
              onClick={() => add(0, checked())}
            >
              加入玩家 0
            </button>
            <button
              type="button"
              class="btn btn-outline-primary"
              disabled={!checked().length}
              onClick={() => add(1, checked())}
            >
              加入玩家 1
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="table w-full">
              <thead>
                <tr>
                  <th></th>
                  <th>选手</th>
                  <th>排名</th>
                  <th>盘数 / 胜盘</th>
                  <th>小分</th>
                  <th>小小分</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <For each={candidates()}>
                  {(candidate) => {
                    const ranking = () =>
                      rankings()?.find((r) => r.userId === candidate.id);
                    const occupied = () =>
                      side0().includes(candidate.id) ||
                      side1().includes(candidate.id);
                    return (
                      <tr
                        class="data-[conflict=true]:bg-red-50"
                        data-conflict={
                          checked().includes(candidate.id) && occupied()
                        }
                      >
                        <td>
                          <input
                            type="checkbox"
                            disabled={occupied()}
                            checked={checked().includes(candidate.id)}
                            onChange={(e) =>
                              setChecked(
                                e.currentTarget.checked
                                  ? [...checked(), candidate.id]
                                  : checked().filter(
                                      (id) => id !== candidate.id,
                                    ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <b>{candidate.name}</b>
                          <br />
                          <small>{candidate.qq}</small>
                        </td>
                        <td>{ranking()?.rank ?? "—"}</td>
                        <td>
                          {ranking()
                            ? `${ranking()!.played} / ${ranking()!.won}`
                            : "—"}
                        </td>
                        <td
                          title={
                            ranking()
                              ? `${ranking()!.tieBreak.numerator}/${ranking()!.tieBreak.denominator}`
                              : ""
                          }
                        >
                          {ranking()
                            ? ranking()!.tieBreak.value.toFixed(3)
                            : "—"}
                        </td>
                        <td
                          title={
                            ranking()
                              ? `${ranking()!.secondTieBreak.numerator}/${ranking()!.secondTieBreak.denominator}`
                              : ""
                          }
                        >
                          {ranking()
                            ? ranking()!.secondTieBreak.value.toFixed(3)
                            : "—"}
                        </td>
                        <td>
                          <button
                            type="button"
                            class="text-blue-6 mr-2"
                            disabled={occupied()}
                            onClick={() => add(0, [candidate.id])}
                          >
                            →0
                          </button>
                          <button
                            type="button"
                            class="text-blue-6"
                            disabled={occupied()}
                            onClick={() => add(1, [candidate.id])}
                          >
                            →1
                          </button>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </section>
        <Show when={error()}>
          <div class="alert alert-border-error">{error()}</div>
        </Show>
        <div class="flex justify-end">
          <button class="btn btn-solid-primary" disabled={busy()}>
            {busy() ? "正在创建…" : "确认并创建场次"}
          </button>
        </div>
      </form>
    </AdminPage>
  );
}
