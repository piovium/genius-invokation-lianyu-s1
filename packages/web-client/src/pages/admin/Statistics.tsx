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
          本页按模拟器原始赢家统计，并排除“不计入统计”的对局；排名和小分按盘次赢家计算，管理员裁定可能使二者不同。出场率分母为
          2 × 对局数。
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
          <div class="overflow-x-auto">
            <table class="table w-full">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>对局</th>
                  <th>胜场</th>
                  <th>胜率</th>
                  <th>使用牌组</th>
                </tr>
              </thead>
              <tbody>
                <For each={users()}>
                  {(user) => (
                    <tr>
                      <td>
                        <b>{user.name}</b>
                        <br />
                        <small>{user.qq}</small>
                      </td>
                      <td>{user.games}</td>
                      <td>{user.wins}</td>
                      <td>{pct(user.winRate)}</td>
                      <td>
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
        <div class="overflow-x-auto">
          <table class="table w-full">
            <thead>
              <tr>
                <th>卡牌 / 组合</th>
                <th>出场数</th>
                <th>出场率</th>
                <th>胜场</th>
                <th>胜率</th>
                <Show when={tab() === "combinations"}>
                  <th>外战场数</th>
                  <th>外战胜率</th>
                </Show>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(row) => (
                  <tr>
                    <td>
                      <b>{name(row.id)}</b>
                      <br />
                      <small>{row.id}</small>
                    </td>
                    <td>{row.appearances}</td>
                    <td>{pct(row.appearanceRate)}</td>
                    <td>{row.wins}</td>
                    <td>{pct(row.winRate)}</td>
                    <Show when={tab() === "combinations"}>
                      <td>{row.awayAppearances ?? 0}</td>
                      <td>{pct(row.awayWinRate ?? 0)}</td>
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
