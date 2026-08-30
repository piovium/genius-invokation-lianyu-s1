import { For, Show, createEffect, createSignal } from "solid-js";
import { useI18n } from "../i18n";

interface Matchup {
  id: string;
  appearances: number;
  wins: number;
  winRate: number | null;
}

export interface CombinationDetail {
  characterKey: string;
  anchor: string;
  overview: {
    id: string;
    appearances: number;
    wins: number;
    appearanceRate: number | null;
    winRate: number | null;
    awayAppearances: number;
    awayWins: number;
    awayWinRate: number | null;
  };
  trend: {
    key: string;
    label: string;
    gameCount: number;
    appearances: number;
    appearanceRate: number | null;
    winRate: number | null;
    awayWinRate: number | null;
  }[];
  matchups: {
    advantages: Matchup[];
    disadvantages: Matchup[];
  };
  positions: {
    id: string;
    appearances: number;
    appearanceRate: number | null;
    winRate: number | null;
    mirrorWinRate: number | null;
    awayWinRate: number | null;
  }[];
  actionCards: {
    id: string;
    appearances: number;
    averageCopies: number | null;
    netCopies: number | null;
    winRate: number | null;
    mirrorWinRate: number | null;
    awayWinRate: number | null;
  }[];
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const rate = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : pct(value);
const quantity = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : value.toFixed(2);

function RateWithDelta(props: {
  value: number | null | undefined;
  baseline: number | null | undefined;
}) {
  const difference = () =>
    props.value === null ||
    props.value === undefined ||
    props.baseline === null ||
    props.baseline === undefined
      ? null
      : props.value - props.baseline;
  const color = () => {
    const value = difference();
    if (value === null || Math.abs(value) < 0.000_001) return "text-gray-5";
    return value > 0 ? "text-success" : "text-error";
  };
  return (
    <>
      {rate(props.value)}
      <Show when={difference() !== null}>
        <span class={`ml-1 text-xs ${color()}`}>
          {difference()! > 0 ? "+" : ""}
          {(difference()! * 100).toFixed(1)}%
        </span>
      </Show>
    </>
  );
}

function CombinationTag(props: {
  id: string;
  variant: "advantage" | "disadvantage" | "position";
}) {
  const { assetsManager } = useI18n();
  const ids = () => props.id.split(":").map(Number);
  const name = () =>
    ids()
      .map((id) => assetsManager().getNameSync(id) ?? String(id))
      .join(" / ");
  return (
    <div class="flex flex-col">
      <div class="mb--2 flex flex-row">
        <For each={ids()}>
          {(id) => (
            <img
              class="h-10 w-10 min-w-0 rounded-full bg-gray-1 object-cover mr--2 last:mr-0 b-2"
              classList={{
                "b-green-3": props.variant === "advantage",
                "b-red-3": props.variant === "disadvantage",
                "b-blue-3": props.variant === "position",
              }}
              src={assetsManager().getImageUrlSync(id, { type: "icon" })}
              alt={assetsManager().getNameSync(id) ?? String(id)}
            />
          )}
        </For>
      </div>
      <div class="grid grid-cols-1 grid-rows-1 children:grid-area-[1/1]">
        <div
          class="text-xs font-bold min-w-0 px-1 w-60%"
          classList={{
            "bg-gradient-to-r from-green-3 to-transparent":
              props.variant === "advantage",
            "bg-gradient-to-r from-red-3 to-transparent":
              props.variant === "disadvantage",
            "bg-gradient-to-r from-blue-3 to-transparent":
              props.variant === "position",
          }}
        />
        <span class="text-xs font-bold px-1 truncate block" title={name()}>
          {name()}
        </span>
      </div>
    </div>
  );
}

function MatchupTable(props: {
  rows: Matchup[];
  variant: "advantage" | "disadvantage";
}) {
  return (
    <Show
      when={props.rows.length}
      fallback={<p class="text-sm text-gray-5">暂无数据</p>}
    >
      <div class="overflow-x-auto table-root">
        <table class="table w-full">
          <thead class="table-header">
            <tr class="table-row">
              <th class="table-head">对手牌组</th>
              <th class="table-head">场数</th>
              <th class="table-head">胜率</th>
            </tr>
          </thead>
          <tbody class="table-body">
            <For each={props.rows}>
              {(item) => (
                <tr class="table-row">
                  <td class="table-cell">
                    <CombinationTag id={item.id} variant={props.variant} />
                  </td>
                  <td class="table-cell">{item.appearances}</td>
                  <td class="table-cell">{rate(item.winRate)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}

function Pagination(props: {
  page: number;
  count: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pageCount = () => Math.ceil(props.count / props.pageSize);
  return (
    <Show when={pageCount() > 1}>
      <div class="mt-3 flex items-center justify-end gap-3">
        <button
          type="button"
          class="btn btn-outline h-9"
          disabled={props.page === 0}
          onClick={() => props.onChange(Math.max(0, props.page - 1))}
        >
          <i class="i-mdi-chevron-left" aria-hidden="true" />
          上一页
        </button>
        <span class="text-sm">
          第 {props.page + 1} / {pageCount()} 页
        </span>
        <button
          type="button"
          class="btn btn-outline h-9"
          disabled={props.page + 1 >= pageCount()}
          onClick={() => props.onChange(props.page + 1)}
        >
          下一页
          <i class="i-mdi-chevron-right" aria-hidden="true" />
        </button>
      </div>
    </Show>
  );
}

function ActionCardTag(props: {
  item: CombinationDetail["actionCards"][number];
  overviewWinRate: number | null;
  overviewAwayWinRate: number | null;
}) {
  const { assetsManager } = useI18n();
  const id = () => Number(props.item.id);
  const name = () => assetsManager().getNameSync(id()) ?? String(props.item.id);
  const items = () => [
    { label: "携带场数", value: () => String(props.item.appearances) },
    { label: "平均携带", value: () => quantity(props.item.averageCopies) },
    { label: "净携带", value: () => quantity(props.item.netCopies) },
    {
      label: "携带胜率",
      value: () => (
        <RateWithDelta
          value={props.item.winRate}
          baseline={props.overviewWinRate}
        />
      ),
    },
    {
      label: "内战胜率",
      value: () => (
        <RateWithDelta value={props.item.mirrorWinRate} baseline={0.5} />
      ),
    },
    {
      label: "外战胜率",
      value: () => (
        <RateWithDelta
          value={props.item.awayWinRate}
          baseline={props.overviewAwayWinRate}
        />
      ),
    },
  ];
  return (
    <article class="min-h-28 flex items-center gap-3 rounded-lg b b-gray-2 bg-white p-3">
      <img
        class="h-24 w-14 shrink-0 rounded-md bg-gray-1 object-contain"
        src={assetsManager().getImageUrlSync(id(), { type: "cardFace" })}
        alt={name()}
      />
      <div class="min-w-0 flex-1">
        <div class="mb-2 min-w-0">
          <h5 class="truncate text-sm font-bold" title={name()}>
            {name()}
            <span class="text-xs text-gray-4 ms-1">{props.item.id}</span>
          </h5>
        </div>
        <dl class="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
          <For each={items()}>
            {(item) => (
              <div class="min-w-0">
                <dt class="truncate text-gray-5">{item.label}</dt>
                <dd class="whitespace-nowrap font-medium tabular-nums">
                  {item.value()}
                </dd>
              </div>
            )}
          </For>
        </dl>
      </div>
    </article>
  );
}

export function StatisticsCombinationDetail(props: {
  characterKey: string;
  detail: CombinationDetail | undefined;
  loading: boolean;
  name: (id: string) => string | undefined;
  onBack: () => void;
}) {
  const { assetsManager } = useI18n();
  const [advantagePage, setAdvantagePage] = createSignal(0);
  const [disadvantagePage, setDisadvantagePage] = createSignal(0);
  const [actionCardPage, setActionCardPage] = createSignal(0);
  createEffect(() => {
    props.characterKey;
    props.detail;
    setAdvantagePage(0);
    setDisadvantagePage(0);
    setActionCardPage(0);
  });
  const page = <T,>(items: readonly T[], value: number, pageSize: number) =>
    items.slice(value * pageSize, value * pageSize + pageSize);

  return (
    <>
      <div class="mb-4 flex items-center gap-3">
        <button
          type="button"
          class="btn btn-ghost-primary h-9 w-9 p-0"
          title="返回三角色组合列表"
          aria-label="返回三角色组合列表"
          onClick={props.onBack}
        >
          <i class="i-mdi-arrow-left" aria-hidden="true" />
        </button>
        <div>
          <h3 class="text-xl font-bold">{props.name(props.characterKey)}</h3>
        </div>
      </div>
      <Show when={!props.loading} fallback={<p>正在加载牌组详情…</p>}>
        <Show when={props.detail}>
          {(result) => (
            <>
              <section class="mb-7">
                <h4 class="text-lg font-bold mb-2">总览</h4>
                <div class="flex flex-row items-center gap-8">
                  <div class="flex flex-row gap-3">
                    <For each={props.characterKey.split(":").map(Number)}>
                      {(id) => (
                        <img
                          class="h-62 w-37 rounded-4.5 bg-gray-1 object-contain b-4 b-gray-4"
                          src={assetsManager().getImageUrlSync(id, {
                            type: "cardFace",
                          })}
                          alt={assetsManager().getNameSync(id) ?? String(id)}
                        />
                      )}
                    </For>
                  </div>
                  <dl class="grid grid-cols-2 gap-x-8 gap-y-5 flex-1">
                    <For
                      each={[
                        {
                          label: "出场数",
                          value: String(result().overview.appearances),
                        },
                        {
                          label: "出场率",
                          value: rate(result().overview.appearanceRate),
                        },
                        {
                          label: "胜场",
                          value: String(result().overview.wins),
                        },
                        {
                          label: "胜率",
                          value: rate(result().overview.winRate),
                        },
                        {
                          label: "外战场数",
                          value: String(result().overview.awayAppearances),
                        },
                        {
                          label: "外战胜率",
                          value: rate(result().overview.awayWinRate),
                        },
                      ]}
                    >
                      {(item) => (
                        <div class="b-b b-gray-2 pb-2">
                          <dt class="text-sm text-gray-5">{item.label}</dt>
                          <dd class="mt-1 text-xl font-bold tabular-nums">
                            {item.value}
                          </dd>
                        </div>
                      )}
                    </For>
                  </dl>
                </div>
              </section>

              <section class="mb-7">
                <h4 class="text-lg font-bold mb-2">趋势</h4>
                <div class="overflow-x-auto table-root">
                  <table class="table w-full">
                    <thead class="table-header">
                      <tr class="table-row">
                        <th class="table-head">时段</th>
                        <th class="table-head">出场数</th>
                        <th class="table-head">出场率</th>
                        <th class="table-head">胜率</th>
                        <th class="table-head">外战胜率</th>
                      </tr>
                    </thead>
                    <tbody class="table-body">
                      <For each={result().trend}>
                        {(item) => (
                          <tr class="table-row">
                            <td class="table-cell font-bold">{item.label}</td>
                            <td class="table-cell">{item.appearances}</td>
                            <td class="table-cell">
                              <RateWithDelta
                                value={item.appearanceRate}
                                baseline={result().overview.appearanceRate}
                              />
                            </td>
                            <td class="table-cell">
                              <RateWithDelta
                                value={item.winRate}
                                baseline={result().overview.winRate}
                              />
                            </td>
                            <td class="table-cell">
                              <RateWithDelta
                                value={item.awayWinRate}
                                baseline={result().overview.awayWinRate}
                              />
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="mb-7">
                <h4 class="text-lg font-bold mb-2">克制关系</h4>
                <div class="grid grid-cols-2 gap-5">
                  <div>
                    <h5 class="font-bold text-success mb-2">优势对局</h5>
                    <MatchupTable
                      rows={page(
                        result().matchups.advantages,
                        advantagePage(),
                        6,
                      )}
                      variant="advantage"
                    />
                    <Pagination
                      page={advantagePage()}
                      count={result().matchups.advantages.length}
                      pageSize={6}
                      onChange={setAdvantagePage}
                    />
                  </div>
                  <div>
                    <h5 class="font-bold text-error mb-2">劣势对局</h5>
                    <MatchupTable
                      rows={page(
                        result().matchups.disadvantages,
                        disadvantagePage(),
                        6,
                      )}
                      variant="disadvantage"
                    />
                    <Pagination
                      page={disadvantagePage()}
                      count={result().matchups.disadvantages.length}
                      pageSize={6}
                      onChange={setDisadvantagePage}
                    />
                  </div>
                </div>
              </section>

              <section class="mb-7">
                <h4 class="text-lg font-bold mb-2">站位</h4>
                <div class="overflow-x-auto table-root">
                  <table class="table w-full">
                    <thead class="table-header">
                      <tr class="table-row">
                        <th class="table-head">角色顺序</th>
                        <th class="table-head">出场数</th>
                        <th class="table-head">占比</th>
                        <th class="table-head">胜率</th>
                        <th class="table-head">内战胜率</th>
                        <th class="table-head">外战胜率</th>
                      </tr>
                    </thead>
                    <tbody class="table-body">
                      <For each={result().positions}>
                        {(item) => (
                          <tr class="table-row">
                            <td class="table-cell">
                              <CombinationTag id={item.id} variant="position" />
                            </td>
                            <td class="table-cell">{item.appearances}</td>
                            <td class="table-cell">
                              {rate(item.appearanceRate)}
                            </td>
                            <td class="table-cell">
                              <RateWithDelta
                                value={item.winRate}
                                baseline={result().overview.winRate}
                              />
                            </td>
                            <td class="table-cell">
                              <RateWithDelta
                                value={item.mirrorWinRate}
                                baseline={0.5}
                              />
                            </td>
                            <td class="table-cell">
                              <RateWithDelta
                                value={item.awayWinRate}
                                baseline={result().overview.awayWinRate}
                              />
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h4 class="text-lg font-bold mb-2">行动牌选择</h4>
                <div class="grid grid-cols-3 gap-3">
                  <For each={page(result().actionCards, actionCardPage(), 30)}>
                    {(item) => (
                      <ActionCardTag
                        item={item}
                        overviewWinRate={result().overview.winRate}
                        overviewAwayWinRate={result().overview.awayWinRate}
                      />
                    )}
                  </For>
                </div>
                <Pagination
                  page={actionCardPage()}
                  count={result().actionCards.length}
                  pageSize={30}
                  onChange={setActionCardPage}
                />
              </section>
            </>
          )}
        </Show>
      </Show>
    </>
  );
}
