import axios from "axios";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminPage } from "./shared";
import { useI18n } from "../../i18n";

type Source = "all" | "tournament" | "casual";
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
  source: Source;
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

export default function Statistics() {
  const { assetsManager } = useI18n();
  const [source, setSource] = createSignal<Source>("all");
  const [tab, setTab] = createSignal<
    "characters" | "actionCards" | "combinations" | "users"
  >("characters");
  const [cards] = createResource(source, (value) =>
    axios
      .get<CardStats>("admin/statistics/cards", { params: { source: value } })
      .then((r) => r.data),
  );
  const [users] = createResource(source, (value) =>
    axios
      .get<UserStats[]>("admin/statistics/users", { params: { source: value } })
      .then((r) => r.data),
  );
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
        <div class="flex flex-wrap gap-2 mb-3">
          <span class="font-bold mr-2">数据源</span>
          <For
            each={
              [
                { v: "all", t: "全部" },
                { v: "tournament", t: "比赛对局" },
                { v: "casual", t: "普通对局" },
              ] as const
            }
          >
            {(item) => (
              <button
                class="btn data-[active=true]:btn-solid-primary btn-outline"
                data-active={source() === item.v}
                onClick={() => setSource(item.v)}
              >
                {item.t}
              </button>
            )}
          </For>
        </div>
        <div class="alert alert-border-info text-sm">
          <p>
            本页按模拟器原始赢家统计，并排除“不计入统计”的对局；出场率分母为 2 ×
            对局数。
          </p>
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
              class="btn btn-outline data-[active=true]:btn-solid-primary"
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
        <p class="mb-2 text-sm">
          有效样本 {cards()?.gameCount ?? 0} 局，出场率分母{" "}
          {cards()?.denominator ?? 0}。
        </p>
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
