// Copyright (C) 2024-2025 Guyutongxue
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { For, Match, Switch, createResource, Accessor, Show } from "solid-js";
import { Layout } from "../layouts/Layout";
import axios from "axios";
import { A } from "@solidjs/router";
import { DeckBriefInfo } from "../components/DeckBriefInfo";
import type { Deck } from "@gi-tcg/typings";
import { useGuestDecks } from "../guest";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import type { MatchDeck } from "../api/models";
import { errorMessage } from "../api/errors";

export interface DeckInfo extends Deck {
  id: number;
  name: string;
  code: string;
  requiredVersion: number;
  characterNames?: string[];
  competition?: MatchDeck | null;
}

interface DecksResponse {
  count: number;
  data: DeckInfo[];
}

export interface UseDecksResult {
  readonly decks: Accessor<DecksResponse>;
  readonly loading: Accessor<boolean>;
  readonly error: Accessor<any>;
  readonly refetch: () => void;
}

export function useDecks(): UseDecksResult {
  const { status } = useAuth();
  const EMPTY = { count: 0, data: [] };
  const [userDecks, { refetch }] = createResource(
    status,
    () => axios.get<DecksResponse>("decks").then((res) => res.data),
    {
      initialValue: EMPTY,
    },
  );
  const [guestDecks] = useGuestDecks();
  return {
    decks: () => {
      const { type } = status();
      if (type === "guest") {
        const data = guestDecks();
        return {
          data,
          count: data.length,
        };
      } else if (type === "user" && userDecks.state === "ready") {
        return userDecks();
      } else {
        return EMPTY;
      }
    },
    loading: () => status().type === "user" && userDecks.loading,
    error: () => (status().type === "user" ? userDecks.error : void 0),
    refetch: () => (status().type === "user" ? refetch() : void 0),
  };
}

export default function Decks() {
  const { t } = useI18n();
  const { status } = useAuth();
  const { decks, loading, error, refetch } = useDecks();
  const [, { pinGuestDeck }] = useGuestDecks();

  const selected = () => decks().data.filter((deck) => deck.competition);
  const exhausted = () =>
    selected().filter((deck) => !deck.competition!.usable);
  const available = () => selected().filter((deck) => deck.competition!.usable);
  const ordinary = () => decks().data.filter((deck) => !deck.competition);
  const context = () => selected()[0]?.competition?.match;
  const currentUser = () => {
    const current = status();
    return current.type === "user" ? current : null;
  };
  const canManage = () =>
    currentUser()?.competitionStatus === "PLAYER" &&
    !!currentUser()?.activeMatchId &&
    (!context() || context()?.event.phase === "DECK_COLLECTION");

  const toggleCompetition = async (deck: DeckInfo, select: boolean) => {
    try {
      if (select) await axios.put(`decks/${deck.id}/competition`);
      else await axios.delete(`decks/${deck.id}/competition`);
      refetch();
    } catch (reason) {
      alert(errorMessage(reason));
    }
  };

  const pinDeck = async (deck: DeckInfo) => {
    const { type } = status();
    try {
      if (type === "guest") {
        await pinGuestDeck(deck.id);
      } else if (type === "user") {
        // trigger updatedAt
        await axios.patch(`decks/${deck.id}`, { name: deck.name });
      }
      refetch();
    } catch (e) {
      alert(errorMessage(e) || t("pinFailed"));
      console.error(e);
    }
  };

  return (
    <Layout>
      <div class="container mx-auto h-full px-2 flex flex-col">
        <div class="sticky top-0 md:top-[calc(4rem+var(--root-padding-top))] z-10 flex flex-row gap-4 justify-between items-center mb-5 py-2 bg-white">
          <h2 class="text-2xl font-bold">{t("myDecks")}</h2>
          <A class="btn btn-outline-green" href="/decks/new">
            <i class="i-mdi-plus" /> {t("add")}
          </A>
        </div>
        <Switch>
          <Match when={loading()}>{t("loading")}</Match>
          <Match when={error()}>
            {t("loadFailed", { message: error()?.message ?? String(error()) })}
          </Match>
          <Match when={true}>
            <div class="overflow-y-auto scrollbar-thin-hover pb-6">
              <Show when={selected().length}>
                <section class="mb-6 b-b-2 pb-6">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-bold">比赛牌组</h3>
                    <span class="text-sm">
                      已选择 {selected().length} /{" "}
                      {context()?.event.deckLimit || "不限"}
                    </span>
                  </div>
                  <Show when={context()?.event.phase !== "DECK_COLLECTION"}>
                    <p class="mb-3 text-sm text-purple-8">
                      <i class="i-mdi-lock" /> 场次已进入
                      {context()?.event.phase === "RUNNING" ? "进行中" : "结束"}
                      阶段，比赛牌组已锁定。
                    </p>
                  </Show>
                  <ul class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] md:gap-3">
                    <For each={available()}>
                      {(deckData) => (
                        <DeckBriefInfo
                          variant="selected"
                          competitionAction="remove"
                          onCompetition={
                            canManage()
                              ? () => toggleCompetition(deckData, false)
                              : undefined
                          }
                          {...deckData}
                        />
                      )}
                    </For>
                    <For each={exhausted()}>
                      {(deckData) => (
                        <DeckBriefInfo
                          variant="disabled"
                          {...deckData}
                        />
                      )}
                    </For>
                  </ul>
                </section>
              </Show>
              <section>
                <h3 class="text-lg font-bold mb-3">其它牌组</h3>
                <ul class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] md:gap-3">
                  <For
                    each={ordinary()}
                    fallback={
                      <li class="p-4 text-gray-5">{t("noDecksAddHint")}</li>
                    }
                  >
                    {(deckData) => (
                      <DeckBriefInfo
                        editable
                        competitionAction={canManage() ? "add" : undefined}
                        onCompetition={
                          canManage()
                            ? () => toggleCompetition(deckData, true)
                            : undefined
                        }
                        onDelete={() => refetch()}
                        onPin={() => pinDeck(deckData)}
                        {...deckData}
                      />
                    )}
                  </For>
                </ul>
              </section>
            </div>
          </Match>
        </Switch>
      </div>
    </Layout>
  );
}
