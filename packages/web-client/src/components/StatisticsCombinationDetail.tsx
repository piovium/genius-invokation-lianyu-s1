import { For, Show, createEffect, createSignal } from "solid-js";

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

function MatchupTable(props: {
  rows: Matchup[];
  name: (id: string) => string | undefined;
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
                    <b>{props.name(item.id)}</b>
                    <br />
                    <small>{item.id}</small>
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
  onChange: (page: number) => void;
}) {
  const pageCount = () => Math.ceil(props.count / 10);
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

export function StatisticsCombinationDetail(props: {
  characterKey: string;
  detail: CombinationDetail | undefined;
  loading: boolean;
  name: (id: string) => string | undefined;
  onBack: () => void;
}) {
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
  const page = <T,>(items: readonly T[], value: number) =>
    items.slice(value * 10, value * 10 + 10);

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
          <p class="text-sm text-gray-5">{props.characterKey}</p>
        </div>
      </div>
      <Show when={!props.loading} fallback={<p>正在加载牌组详情…</p>}>
        <Show when={props.detail}>
          {(result) => (
            <>
              <section class="mb-7">
                <h4 class="text-lg font-bold mb-2">总览</h4>
                <div class="overflow-x-auto table-root">
                  <table class="table w-full">
                    <thead class="table-header">
                      <tr class="table-row">
                        <th class="table-head">出场数</th>
                        <th class="table-head">出场率</th>
                        <th class="table-head">胜场</th>
                        <th class="table-head">胜率</th>
                        <th class="table-head">外战场数</th>
                        <th class="table-head">外战胜率</th>
                      </tr>
                    </thead>
                    <tbody class="table-body">
                      <tr class="table-row">
                        <td class="table-cell">
                          {result().overview.appearances}
                        </td>
                        <td class="table-cell">
                          {rate(result().overview.appearanceRate)}
                        </td>
                        <td class="table-cell">{result().overview.wins}</td>
                        <td class="table-cell">
                          {rate(result().overview.winRate)}
                        </td>
                        <td class="table-cell">
                          {result().overview.awayAppearances}
                        </td>
                        <td class="table-cell">
                          {rate(result().overview.awayWinRate)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="mb-7">
                <h4 class="text-lg font-bold mb-2">趋势</h4>
                <div class="overflow-x-auto table-root">
                  <table class="table w-full">
                    <thead class="table-header">
                      <tr class="table-row">
                        <th class="table-head">时段</th>
                        <th class="table-head">时段对局</th>
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
                            <td class="table-cell">{item.gameCount}</td>
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
                      rows={page(result().matchups.advantages, advantagePage())}
                      name={props.name}
                    />
                    <Pagination
                      page={advantagePage()}
                      count={result().matchups.advantages.length}
                      onChange={setAdvantagePage}
                    />
                  </div>
                  <div>
                    <h5 class="font-bold text-error mb-2">劣势对局</h5>
                    <MatchupTable
                      rows={page(
                        result().matchups.disadvantages,
                        disadvantagePage(),
                      )}
                      name={props.name}
                    />
                    <Pagination
                      page={disadvantagePage()}
                      count={result().matchups.disadvantages.length}
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
                              <b>{props.name(item.id)}</b>
                              <br />
                              <small>{item.id}</small>
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
                <div class="overflow-x-auto table-root">
                  <table class="table w-full">
                    <thead class="table-header">
                      <tr class="table-row">
                        <th class="table-head">行动牌</th>
                        <th class="table-head">携带场数</th>
                        <th class="table-head">平均携带数量</th>
                        <th class="table-head">净携带数量</th>
                        <th class="table-head">携带胜率</th>
                        <th class="table-head">携带内战胜率</th>
                        <th class="table-head">携带外战胜率</th>
                      </tr>
                    </thead>
                    <tbody class="table-body">
                      <For each={page(result().actionCards, actionCardPage())}>
                        {(item) => (
                          <tr class="table-row">
                            <td class="table-cell">
                              <b>{props.name(item.id)}</b>
                              <br />
                              <small>{item.id}</small>
                            </td>
                            <td class="table-cell">{item.appearances}</td>
                            <td class="table-cell">
                              {quantity(item.averageCopies)}
                            </td>
                            <td class="table-cell">
                              {quantity(item.netCopies)}
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
                <Pagination
                  page={actionCardPage()}
                  count={result().actionCards.length}
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
