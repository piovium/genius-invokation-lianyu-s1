import axios from "axios";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { AdminPage } from "./shared";
import { useI18n } from "../../i18n";

type Source = "tournament" | "casual";
interface StatisticsFilters {
  createdAtFrom?: string;
  createdAtTo?: string;
  sources: Source[];
  eventIds: number[];
  roundCounts?: number[];
  includeSurrender: boolean;
  includeAdmin: boolean;
}
interface StatisticsOptions {
  events: { id: number; name: string }[];
}
interface Aggregate {
  id: string;
  appearances: number;
  wins: number;
  appearanceRate: number;
  winRate: number;
  awayAppearances?: number;
  awayWins?: number;
  awayWinRate?: number;
}
interface CardStats {
  gameCount: number;
  denominator: number;
  characters: Aggregate[];
  actionCards: Aggregate[];
  combinations: Aggregate[];
}
interface UserStats {
  id: number;
  qq: string;
  name: string;
  games: number;
  wins: number;
  winRate: number;
  decks: {
    deck: { characters: number[]; cards: number[] };
    uses: number;
    firstUsedAt: string;
    lastUsedAt: string;
  }[];
}
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const defaultFilters = (): StatisticsFilters => ({
  sources: ["tournament", "casual"],
  eventIds: [],
  includeSurrender: true,
  includeAdmin: true,
});
const copyFilters = (filters: StatisticsFilters): StatisticsFilters => ({
  ...filters,
  sources: [...filters.sources],
  eventIds: [...filters.eventIds],
  roundCounts: filters.roundCounts ? [...filters.roundCounts] : undefined,
});
const queryParams = (filters: StatisticsFilters) => ({
  createdAtFrom: filters.createdAtFrom || undefined,
  createdAtTo: filters.createdAtTo || undefined,
  sources: filters.sources.join(","),
  eventIds: filters.eventIds.length ? filters.eventIds.join(",") : undefined,
  roundCounts: filters.roundCounts?.join(","),
  includeSurrender: filters.includeSurrender,
  includeAdmin: filters.includeAdmin,
});

export default function Statistics() {
  const { assetsManager } = useI18n();
  const [filterOpen, setFilterOpen] = createSignal(false);
  const [draft, setDraft] = createSignal(defaultFilters());
  const [filters, setFilters] = createSignal(defaultFilters());
  const [tab, setTab] = createSignal<
    "characters" | "actionCards" | "combinations" | "users"
  >("characters");
  const [options] = createResource(() =>
    axios
      .get<StatisticsOptions>("admin/statistics/options")
      .then((response) => response.data),
  );
  const [cards] = createResource(filters, (value) =>
    axios
      .get<CardStats>("admin/statistics/cards", { params: queryParams(value) })
      .then((r) => r.data),
  );
  const [users] = createResource(filters, (value) =>
    axios
      .get<UserStats[]>("admin/statistics/users", {
        params: queryParams(value),
      })
      .then((r) => r.data),
  );
  const invalidDateRange = createMemo(
    () =>
      !!draft().createdAtFrom &&
      !!draft().createdAtTo &&
      draft().createdAtFrom! > draft().createdAtTo!,
  );
  const selectedEvents = createMemo(() => {
    const selected = new Set(draft().eventIds);
    return options()?.events.filter((event) => selected.has(event.id)) ?? [];
  });
  const toggleSource = (source: Source) =>
    setDraft((current) => {
      const selected = current.sources.includes(source);
      if (selected && current.sources.length === 1) return current;
      return {
        ...current,
        sources: selected
          ? current.sources.filter((item) => item !== source)
          : [...current.sources, source],
        eventIds: source === "tournament" && selected ? [] : current.eventIds,
      };
    });
  const toggleRound = (round: number) =>
    setDraft((current) => {
      if (!current.roundCounts) return { ...current, roundCounts: [round] };
      const selected = current.roundCounts.includes(round);
      const roundCounts = selected
        ? current.roundCounts.filter((item) => item !== round)
        : [...current.roundCounts, round].sort((a, b) => a - b);
      return {
        ...current,
        roundCounts:
          roundCounts.length === 0 || roundCounts.length === 14
            ? undefined
            : roundCounts,
      };
    });
  const addEvent = (eventId: number) =>
    setDraft((current) => ({
      ...current,
      sources: current.sources.includes("tournament")
        ? current.sources
        : [...current.sources, "tournament"],
      eventIds: current.eventIds.includes(eventId)
        ? current.eventIds
        : [...current.eventIds, eventId],
    }));
  const removeEvent = (eventId: number) =>
    setDraft((current) => ({
      ...current,
      eventIds: current.eventIds.filter((id) => id !== eventId),
    }));
  const rows = () =>
    tab() === "characters"
      ? cards()?.characters
      : tab() === "actionCards"
        ? cards()?.actionCards
        : cards()?.combinations;
  const name = (id: string) =>
    id.includes(":")
      ? id
          .split(":")
          .map((x) => assetsManager().getNameSync(Number(x)))
          .join(" / ")
      : assetsManager().getNameSync(Number(id));

  return (
    <AdminPage title="业务统计">
      <div class="sticky top-0 z-10 bg-white pb-3">
        <div class="rounded-lg b b-gray-2 bg-white p-3 mb-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm">
              <Show when={!cards.loading} fallback="正在查询统计样本…">
                有效样本 <b>{cards()?.gameCount ?? 0}</b> 局，出场率分母{" "}
                <b>{cards()?.denominator ?? 0}</b>
              </Show>
            </p>
            <button
              type="button"
              class="btn btn-outline-primary h-9"
              aria-expanded={filterOpen()}
              onClick={() => setFilterOpen((open) => !open)}
            >
              <i class="i-mdi-filter-variant" aria-hidden="true" />
              数据源筛选
              <i
                class={filterOpen() ? "i-mdi-chevron-up" : "i-mdi-chevron-down"}
                aria-hidden="true"
              />
            </button>
          </div>
          <Show when={filterOpen()}>
            <form
              class="mt-4 b-t b-gray-2 pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (invalidDateRange()) return;
                setFilters(copyFilters(draft()));
                setFilterOpen(false);
              }}
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="flex flex-col gap-1">
                  <span class="font-bold text-sm">最早日期</span>
                  <input
                    type="date"
                    class="input input-solid h-10"
                    max={draft().createdAtTo}
                    value={draft().createdAtFrom ?? ""}
                    onInput={(event) =>
                      setDraft((current) => ({
                        ...current,
                        createdAtFrom: event.currentTarget.value || undefined,
                      }))
                    }
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-bold text-sm">最晚日期</span>
                  <input
                    type="date"
                    class="input input-solid h-10"
                    min={draft().createdAtFrom}
                    value={draft().createdAtTo ?? ""}
                    onInput={(event) =>
                      setDraft((current) => ({
                        ...current,
                        createdAtTo: event.currentTarget.value || undefined,
                      }))
                    }
                  />
                </label>
              </div>

              <fieldset class="mt-4">
                <legend class="font-bold text-sm mb-2">对局类型</legend>
                <div class="flex flex-wrap gap-2">
                  <For
                    each={
                      [
                        { value: "tournament", label: "比赛对局" },
                        { value: "casual", label: "普通对局" },
                      ] as const
                    }
                  >
                    {(item) => (
                      <button
                        type="button"
                        class="btn btn-outline h-9 data-[active=true]:btn-solid-primary"
                        data-active={draft().sources.includes(item.value)}
                        aria-pressed={draft().sources.includes(item.value)}
                        onClick={() => toggleSource(item.value)}
                      >
                        {item.label}
                      </button>
                    )}
                  </For>
                </div>
              </fieldset>

              <fieldset class="mt-4">
                <legend class="font-bold text-sm mb-2">指定赛事</legend>
                <select
                  class="h-10 w-full rounded-lg b b-gray-3 bg-white px-3 outline-none focus:b-primary"
                  value=""
                  onChange={(event) => {
                    const id = Number(event.currentTarget.value);
                    if (id) addEvent(id);
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="">
                    {options.loading ? "正在加载赛事…" : "选择要添加的赛事"}
                  </option>
                  <For
                    each={options()?.events.filter(
                      (event) => !draft().eventIds.includes(event.id),
                    )}
                  >
                    {(event) => (
                      <option value={event.id}>
                        {event.name} (#{event.id})
                      </option>
                    )}
                  </For>
                </select>
                <Show when={selectedEvents().length}>
                  <div class="flex flex-wrap gap-2 mt-2">
                    <For each={selectedEvents()}>
                      {(event) => (
                        <span class="badge badge-soft-primary h-8 gap-1 pl-3 pr-1">
                          {event.name}
                          <button
                            type="button"
                            class="btn btn-ghost-primary h-6 w-6 p-0"
                            title={`移除 ${event.name}`}
                            aria-label={`移除 ${event.name}`}
                            onClick={() => removeEvent(event.id)}
                          >
                            <i class="i-mdi-close" aria-hidden="true" />
                          </button>
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </fieldset>

              <fieldset class="mt-4">
                <legend class="font-bold text-sm mb-2">正常结束回合数</legend>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-outline h-9 w-16 data-[active=true]:btn-solid-primary"
                    data-active={!draft().roundCounts}
                    aria-pressed={!draft().roundCounts}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        roundCounts: undefined,
                      }))
                    }
                  >
                    全部
                  </button>
                  <For
                    each={Array.from({ length: 14 }, (_, index) => index + 1)}
                  >
                    {(round) => (
                      <button
                        type="button"
                        class="btn btn-outline h-9 w-10 p-0 data-[active=true]:btn-solid-primary"
                        data-active={
                          draft().roundCounts?.includes(round) ?? false
                        }
                        aria-pressed={
                          draft().roundCounts?.includes(round) ?? false
                        }
                        onClick={() => toggleRound(round)}
                      >
                        {round}
                      </button>
                    )}
                  </For>
                </div>
              </fieldset>

              <fieldset class="mt-4">
                <legend class="font-bold text-sm mb-2">结束原因</legend>
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="btn btn-outline h-9 data-[active=true]:btn-solid-primary"
                    data-active={draft().includeSurrender}
                    aria-pressed={draft().includeSurrender}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        includeSurrender: !current.includeSurrender,
                      }))
                    }
                  >
                    包含投降结束
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline h-9 data-[active=true]:btn-solid-primary"
                    data-active={draft().includeAdmin}
                    aria-pressed={draft().includeAdmin}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        includeAdmin: !current.includeAdmin,
                      }))
                    }
                  >
                    包含裁判结束
                  </button>
                </div>
              </fieldset>

              <Show when={invalidDateRange()}>
                <p class="text-error text-sm mt-3">
                  最早日期不能晚于最晚日期。
                </p>
              </Show>
              <div class="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  class="btn btn-ghost"
                  onClick={() => {
                    const defaults = defaultFilters();
                    setDraft(copyFilters(defaults));
                    setFilters(copyFilters(defaults));
                    setFilterOpen(false);
                  }}
                >
                  <i class="i-mdi-filter-remove-outline" aria-hidden="true" />
                  重置
                </button>
                <button
                  class="btn btn-solid-primary"
                  disabled={invalidDateRange()}
                >
                  <i class="i-mdi-magnify" aria-hidden="true" />
                  查询
                </button>
              </div>
            </form>
          </Show>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 my-4">
        <For
          each={
            [
              { v: "characters", t: "角色牌" },
              { v: "actionCards", t: "行动牌" },
              { v: "combinations", t: "三角色组合" },
              { v: "users", t: "用户" },
            ] as const
          }
        >
          {(item) => (
            <button
              class="btn btn-outline h-10 data-[active=true]:btn-solid-primary"
              data-active={tab() === item.v}
              onClick={() => setTab(item.v)}
            >
              {item.t}
            </button>
          )}
        </For>
      </div>
      <Show
        when={tab() !== "users"}
        fallback={
          <div class="overflow-x-auto table-root">
            <table class="table w-full">
              <thead class="table-header">
                <tr class="table-row">
                  <th class="table-head">用户</th>
                  <th class="table-head">对局</th>
                  <th class="table-head">胜场</th>
                  <th class="table-head">胜率</th>
                  <th class="table-head">使用牌组</th>
                </tr>
              </thead>
              <tbody class="table-body">
                <For each={users()}>
                  {(user) => (
                    <tr class="table-row">
                      <td class="table-cell">
                        <b>{user.name}</b>
                        <br />
                        <small>{user.qq}</small>
                      </td>
                      <td class="table-cell">{user.games}</td>
                      <td class="table-cell">{user.wins}</td>
                      <td class="table-cell">{pct(user.winRate)}</td>
                      <td class="table-cell">
                        <details>
                          <summary class="cursor-pointer">
                            {user.decks.length} 套
                          </summary>
                          <ul class="mt-2">
                            <For each={user.decks}>
                              {(deck) => (
                                <li class="mb-1">
                                  {deck.deck.characters
                                    .map((id) =>
                                      assetsManager().getNameSync(id),
                                    )
                                    .join(" / ")}{" "}
                                  · {deck.uses} 次
                                </li>
                              )}
                            </For>
                          </ul>
                        </details>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        }
      >
        <div class="overflow-x-auto table-root">
          <table class="table w-full">
            <thead class="table-header">
              <tr class="table-row">
                <th class="table-head">卡牌 / 组合</th>
                <th class="table-head">出场数</th>
                <th class="table-head">出场率</th>
                <th class="table-head">胜场</th>
                <th class="table-head">胜率</th>
                <Show when={tab() === "combinations"}>
                  <th class="table-head">外战场数</th>
                  <th class="table-head">外战胜率</th>
                </Show>
              </tr>
            </thead>
            <tbody class="table-body">
              <For each={rows()}>
                {(row) => (
                  <tr class="table-row">
                    <td class="table-cell">
                      <b>{name(row.id)}</b>
                      <br />
                      <small>{row.id}</small>
                    </td>
                    <td class="table-cell">{row.appearances}</td>
                    <td class="table-cell">{pct(row.appearanceRate)}</td>
                    <td class="table-cell">{row.wins}</td>
                    <td class="table-cell">{pct(row.winRate)}</td>
                    <Show when={tab() === "combinations"}>
                      <td class="table-cell">{row.awayAppearances ?? 0}</td>
                      <td class="table-cell">{pct(row.awayWinRate ?? 0)}</td>
                    </Show>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </AdminPage>
  );
}
