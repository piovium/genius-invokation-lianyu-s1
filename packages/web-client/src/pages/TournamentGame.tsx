import { useNavigate, useParams } from "@solidjs/router";
import { staticDecode } from "@gi-tcg/assets-manager";
import axios from "axios";
import {
  For,
  Match,
  Show,
  Switch,
  createResource,
  createSignal,
} from "solid-js";
import { Layout } from "../layouts/Layout";
import { DeckBriefInfo } from "../components/DeckBriefInfo";
import type { DeckInfo } from "./Decks";
import type { MatchMode } from "../api/models";
import { errorMessage } from "../api/errors";
import { roomIdToCode } from "../utils";
import { useAuth } from "../auth";

interface JoinDeck {
  id: number;
  sourceDeckId?: number | null;
  name: string;
  code: string;
  requiredVersion: number;
  deckJson?: { characters: number[]; cards: number[] };
  usable?: boolean;
}
interface JoinOptions {
  gameId: number;
  who: number;
  mode: MatchMode;
  roomConfig: Record<string, unknown>;
  decks: JoinDeck[];
}

export default function TournamentGame() {
  const params = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [options] = createResource<JoinOptions>(() =>
    axios.get(`tournament-games/${params.id}/join-options`).then((r) => r.data),
  );
  const [selected, setSelected] = createSignal<number | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const decks = (): DeckInfo[] =>
    (options()?.decks ?? []).map((deck) => ({
      id: deck.sourceDeckId ?? deck.id,
      name: deck.name,
      code: deck.code,
      requiredVersion: deck.requiredVersion,
      ...(deck.deckJson ?? staticDecode(deck.code)),
    }));

  const join = async () => {
    const deckId = selected();
    if (deckId === null) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.post<{ room: { id: number } }>(
        `tournament-games/${params.id}/join`,
        { deckId },
      );
      const current = auth.status();
      if (current.type !== "user") throw new Error("登录状态已失效");
      navigate(
        `/rooms/${roomIdToCode(data.room.id)}?player=${current.id}&action=1`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div class="mx-auto max-w-180 pb-8">
        <h2 class="text-2xl font-bold">赛事对局确认</h2>
        <Switch>
          <Match when={options.loading}>
            <p class="mt-4">加载中…</p>
          </Match>
          <Match when={options.error}>
            <div class="alert alert-border-error mt-4">
              {errorMessage(options.error)}
            </div>
          </Match>
          <Match when={options()}>
            {(data) => (
              <>
                <section class="rounded-xl bg-amber-50 b b-amber-3 p-4 my-4">
                  <div class="flex flex-wrap gap-2">
                    <span class="badge badge-soft-warning">
                      赛事对局 #{data().gameId}
                    </span>
                    <span class="badge badge-soft-primary">
                      {data().mode === "UNRESTRICTED"
                        ? "无限制模式"
                        : data().mode === "DUEL"
                          ? "决斗模式"
                          : "征服模式"}
                    </span>
                    <span>您是玩家 {data().who}</span>
                  </div>
                  <p class="mt-2 text-sm text-gray-6">
                    场次配置由管理员锁定，仅可选择牌组。先后手、版本、时间、公开性与观战设置不可修改。
                  </p>
                  <details class="mt-2 text-sm">
                    <summary class="cursor-pointer">查看只读房间配置</summary>
                    <pre class="mt-2 overflow-auto rounded bg-white p-2">
                      {JSON.stringify(data().roomConfig, null, 2)}
                    </pre>
                  </details>
                </section>
                <h3 class="font-bold text-lg mb-3">选择本局牌组</h3>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                  <For each={decks()}>
                    {(deck) => (
                      <button
                        class="text-left rounded-xl p-1 b-2 data-[selected=true]:b-amber-5"
                        data-selected={selected() === deck.id}
                        onClick={() => setSelected(deck.id)}
                      >
                        <DeckBriefInfo {...deck} />
                        <span class="block text-center p-1 text-sm">
                          {selected() === deck.id ? "已选择" : "选择"}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
                <Show when={!decks().length}>
                  <div class="alert alert-border-warning mt-3">
                    没有可用牌组，系统不会自动判负。请联系管理员介入处理。
                  </div>
                </Show>
                <Show when={error()}>
                  <div class="alert alert-border-error mt-4">{error()}</div>
                </Show>
                <div class="mt-5 flex justify-end gap-3">
                  <button class="btn btn-ghost" onClick={() => history.back()}>
                    返回
                  </button>
                  <button
                    class="btn btn-solid-primary"
                    disabled={selected() === null || busy()}
                    onClick={join}
                  >
                    {busy() ? "正在进入…" : "进入比赛"}
                  </button>
                </div>
              </>
            )}
          </Match>
        </Switch>
      </div>
    </Layout>
  );
}
