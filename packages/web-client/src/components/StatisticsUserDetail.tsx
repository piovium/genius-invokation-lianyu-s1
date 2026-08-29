import axios from "axios";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { errorMessage } from "../api/errors";
import { useI18n } from "../i18n";
import { formatRate, StatisticsRateWithDelta } from "./StatisticsValue";

interface UserDetail {
  user: { id: number; qq: string; name: string };
  overview: { games: number; wins: number; winRate: number | null };
  combinations: {
    id: string;
    appearances: number;
    wins: number;
    winRate: number | null;
    overviewWinRate: number | null;
  }[];
}

interface GameRecord {
  id: number;
  matchId: number | null;
  endReason: "NORMAL" | "SURRENDER" | "ADMIN" | null;
  roundCount: number | null;
  createdAt: string;
  finishedAt: string | null;
  effectiveWinnerWho: number | null;
  targetWhos: number[];
  players: {
    who: number;
    userId: number | null;
    displayName: string;
    characterKey: string;
    deck: { characters: number[]; cards: number[] };
    won: boolean;
  }[];
}

interface GameRecords {
  count: number;
  skip: number;
  take: number;
  data: GameRecord[];
}

type FilterParams = Record<string, string | boolean | undefined>;

const endReasonLabel = {
  NORMAL: "正常结束",
  SURRENDER: "投降结束",
  ADMIN: "裁判结束",
} as const;

export function StatisticsUserDetail(props: {
  userId: number;
  params: FilterParams;
  name: (id: string) => string | undefined;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [page, setPage] = createSignal(0);
  const [combinationPage, setCombinationPage] = createSignal(0);
  const detailSource = createMemo(() => ({
    userId: props.userId,
    params: props.params,
  }));
  const recordsSource = createMemo(() => ({
    userId: props.userId,
    params: props.params,
    skip: page() * 20,
  }));
  const [detail] = createResource(detailSource, ({ userId, params }) =>
    axios
      .get<UserDetail>(`admin/statistics/users/${userId}`, { params })
      .then((response) => response.data),
  );
  const [records] = createResource(recordsSource, ({ userId, params, skip }) =>
    axios
      .get<GameRecords>(`admin/statistics/users/${userId}/games`, {
        params: { ...params, skip },
      })
      .then((response) => response.data),
  );
  createEffect(() => {
    props.userId;
    JSON.stringify(props.params);
    setPage(0);
    setCombinationPage(0);
  });
  const pageCount = () => Math.ceil((records()?.count ?? 0) / 20);
  const combinationPageCount = () =>
    Math.ceil((detail()?.combinations.length ?? 0) / 10);
  const visibleCombinations = () =>
    detail()?.combinations.slice(
      combinationPage() * 10,
      combinationPage() * 10 + 10,
    ) ?? [];
  const result = (record: GameRecord) => {
    if (record.effectiveWinnerWho === null) return "平";
    return record.targetWhos.includes(record.effectiveWinnerWho) ? "胜" : "败";
  };
  const downloadLog = async (gameId: number) => {
    try {
      const { data } = await axios.get<{ stateLog: unknown }>(
        `games/${gameId}`,
      );
      const blob = new Blob([JSON.stringify(data.stateLog)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gameLog-${gameId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert(t("downloadFailed", { message: errorMessage(error) }));
    }
  };

  return (
    <>
      <div class="mb-4 flex items-center gap-3">
        <button
          type="button"
          class="btn btn-ghost-primary h-9 w-9 p-0"
          title="返回用户列表"
          aria-label="返回用户列表"
          onClick={props.onBack}
        >
          <i class="i-mdi-arrow-left" aria-hidden="true" />
        </button>
        <div>
          <h3 class="text-xl font-bold">{detail()?.user.name ?? "用户详情"}</h3>
          <p class="text-sm text-gray-5">{detail()?.user.qq}</p>
        </div>
      </div>

      <Show when={!detail.loading} fallback={<p>正在加载用户详情…</p>}>
        <Show when={detail()}>
          {(data) => (
            <>
              <section class="mb-7">
                <h4 class="text-lg font-bold mb-2">总览</h4>
                <div class="overflow-x-auto table-root">
                  <table class="table w-full">
                    <thead class="table-header">
                      <tr class="table-row">
                        <th class="table-head">对局</th>
                        <th class="table-head">胜场</th>
                        <th class="table-head">胜率</th>
                      </tr>
                    </thead>
                    <tbody class="table-body">
                      <tr class="table-row">
                        <td class="table-cell">{data().overview.games}</td>
                        <td class="table-cell">{data().overview.wins}</td>
                        <td class="table-cell">
                          {formatRate(data().overview.winRate)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="mb-7">
                <h4 class="text-lg font-bold mb-2">卡组</h4>
                <Show
                  when={data().combinations.length}
                  fallback={<p class="text-sm text-gray-5">暂无卡组数据</p>}
                >
                  <div class="overflow-x-auto table-root">
                    <table class="table w-full">
                      <thead class="table-header">
                        <tr class="table-row">
                          <th class="table-head">三角色组合</th>
                          <th class="table-head">出场数</th>
                          <th class="table-head">胜率</th>
                        </tr>
                      </thead>
                      <tbody class="table-body">
                        <For each={visibleCombinations()}>
                          {(item) => (
                            <tr class="table-row">
                              <td class="table-cell">
                                <b>{props.name(item.id)}</b>
                                <br />
                                <small>{item.id}</small>
                              </td>
                              <td class="table-cell">{item.appearances}</td>
                              <td class="table-cell">
                                <StatisticsRateWithDelta
                                  value={item.winRate}
                                  baseline={item.overviewWinRate}
                                />
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                  <Show when={combinationPageCount() > 1}>
                    <div class="mt-3 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        class="btn btn-outline h-9"
                        disabled={combinationPage() === 0}
                        onClick={() =>
                          setCombinationPage((value) => Math.max(0, value - 1))
                        }
                      >
                        <i class="i-mdi-chevron-left" aria-hidden="true" />
                        上一页
                      </button>
                      <span class="text-sm">
                        第 {combinationPage() + 1} / {combinationPageCount()} 页
                      </span>
                      <button
                        type="button"
                        class="btn btn-outline h-9"
                        disabled={
                          combinationPage() + 1 >= combinationPageCount()
                        }
                        onClick={() => setCombinationPage((value) => value + 1)}
                      >
                        下一页
                        <i class="i-mdi-chevron-right" aria-hidden="true" />
                      </button>
                    </div>
                  </Show>
                </Show>
              </section>
            </>
          )}
        </Show>
      </Show>

      <section>
        <div class="mb-2 flex items-center justify-between gap-3">
          <h4 class="text-lg font-bold">对局记录</h4>
          <Show when={records()}>
            {(data) => (
              <span class="text-sm text-gray-5">共 {data().count} 局</span>
            )}
          </Show>
        </div>
        <Show when={!records.loading} fallback={<p>正在加载对局记录…</p>}>
          <Show
            when={records()?.data.length}
            fallback={<p class="text-sm text-gray-5">暂无对局记录</p>}
          >
            <div class="overflow-x-auto table-root">
              <table class="table w-full">
                <thead class="table-header">
                  <tr class="table-row">
                    <th class="table-head">时间</th>
                    <th class="table-head">结果</th>
                    <th class="table-head">结束信息</th>
                    <th class="table-head">先手牌组</th>
                    <th class="table-head">后手牌组</th>
                    <th class="table-head">操作</th>
                  </tr>
                </thead>
                <tbody class="table-body">
                  <For each={records()?.data}>
                    {(record) => (
                      <tr class="table-row">
                        <td class="table-cell whitespace-nowrap">
                          {new Date(
                            record.finishedAt ?? record.createdAt,
                          ).toLocaleString()}
                        </td>
                        <td class="table-cell">
                          <span
                            class="badge"
                            classList={{
                              "badge-soft-success": result(record) === "胜",
                              "badge-soft-error": result(record) === "败",
                              "badge-soft-warning": result(record) === "平",
                            }}
                          >
                            {result(record)}
                          </span>
                        </td>
                        <td class="table-cell whitespace-nowrap">
                          {record.endReason
                            ? endReasonLabel[record.endReason]
                            : "-"}
                          {record.roundCount === null
                            ? ""
                            : ` · ${record.roundCount} 回合`}
                        </td>
                        <For each={[0, 1]}>
                          {(who) => {
                            const player = () =>
                              record.players.find((item) => item.who === who);
                            return (
                              <td class="table-cell">
                                <Show when={player()} fallback="-">
                                  {(item) => (
                                    <>
                                      <b>{item().displayName}</b>
                                      <br />
                                      <span>
                                        {props.name(item().characterKey)}
                                      </span>
                                      <br />
                                      <small>{item().characterKey}</small>
                                    </>
                                  )}
                                </Show>
                              </td>
                            );
                          }}
                        </For>
                        <td class="table-cell">
                          <button
                            type="button"
                            class="btn btn-ghost h-8 w-8 p-0"
                            title={t("downloadLog")}
                            aria-label={t("downloadLog")}
                            onClick={() => downloadLog(record.id)}
                          >
                            <i
                              class="i-mdi-download text-lg"
                              aria-hidden="true"
                            />
                          </button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
        <Show when={pageCount() > 1}>
          <div class="mt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              class="btn btn-outline h-9"
              disabled={page() === 0 || records.loading}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              <i class="i-mdi-chevron-left" aria-hidden="true" />
              上一页
            </button>
            <span class="text-sm">
              第 {page() + 1} / {pageCount()} 页
            </span>
            <button
              type="button"
              class="btn btn-outline h-9"
              disabled={page() + 1 >= pageCount() || records.loading}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
              <i class="i-mdi-chevron-right" aria-hidden="true" />
            </button>
          </div>
        </Show>
      </section>
    </>
  );
}
