import axios from "axios";
import {
  For,
  Match,
  Show,
  Switch,
  createResource,
  createSignal,
} from "solid-js";
import { errorMessage } from "../../api/errors";
import { AdminPage } from "./shared";

interface EventOption {
  id: number;
  name: string;
}

interface ResultRow {
  id: number;
  qq: string;
  name: string;
  competitionStatus: "NONE" | "REGISTERED" | "PLAYER";
  rank: number | null;
  played: number;
  won: number;
  results: Record<number, 0 | 1>;
  tieBreak: { numerator: number; denominator: number; value: number };
  secondTieBreak: {
    numerator: number;
    denominator: number;
    value: number;
  };
}

interface ResultsPreview {
  events: EventOption[];
  rows: ResultRow[];
}

export default function AdminResults() {
  const [selected, setSelected] = createSignal<number[]>([]);
  const [options] = createResource(() =>
    axios
      .get<{ events: EventOption[] }>("admin/statistics/options")
      .then((response) => response.data.events),
  );
  const source = () => (selected().length ? [...selected()] : false);
  const [preview] = createResource(source, (eventIds) =>
    axios
      .post<ResultsPreview>("admin/results/preview", { eventIds })
      .then((response) => response.data),
  );
  const toggle = (eventId: number, checked: boolean) =>
    setSelected((current) =>
      checked ? [...current, eventId] : current.filter((id) => id !== eventId),
    );

  return (
    <AdminPage title="比赛结果">
      <fieldset class="mb-4 rounded-lg b b-gray-2 p-3">
        <legend class="px-2 font-bold">统计场次</legend>
        <div class="flex flex-wrap gap-3">
          <For
            each={options()}
            fallback={<span class="text-gray-5">暂无场次</span>}
          >
            {(event) => (
              <label class="flex items-center gap-2">
                <input
                  class="checkbox"
                  type="checkbox"
                  checked={selected().includes(event.id)}
                  onChange={(inputEvent) =>
                    toggle(event.id, inputEvent.currentTarget.checked)
                  }
                />
                {event.name}
              </label>
            )}
          </For>
        </div>
      </fieldset>
      <Switch>
        <Match when={!selected().length}>
          <p class="text-gray-5">请选择至少一个场次。</p>
        </Match>
        <Match when={preview.loading}>
          <p class="text-gray-5">正在统计比赛结果…</p>
        </Match>
        <Match when={preview.error}>
          <p class="text-red-6">
            比赛结果加载失败：{errorMessage(preview.error)}
          </p>
        </Match>
        <Match when={preview()}>
          {(data) => (
            <div class="overflow-x-auto table-root">
              <table class="table w-full">
                <thead class="table-header">
                  <tr class="table-row">
                    <th class="table-head">排名</th>
                    <th class="table-head">选手</th>
                    <th class="table-head">胜盘</th>
                    <For each={data().events}>
                      {(event) => (
                        <th class="table-head" title={event.name}>
                          {event.name}
                        </th>
                      )}
                    </For>
                    <th class="table-head">小分</th>
                    <th class="table-head">小小分</th>
                  </tr>
                </thead>
                <tbody class="table-body">
                  <For each={data().rows}>
                    {(row) => (
                      <tr class="table-row children:py-0">
                        <td class="table-cell font-bold">{row.rank ?? "—"}</td>
                        <td class="table-cell">
                          <b>{row.name}</b>
                          <Show when={row.competitionStatus !== "PLAYER"}>
                            <span class="badge badge-soft-error ml-2">
                              退赛
                            </span>
                          </Show>
                          <br />
                          <small class="text-gray-5">{row.qq}</small>
                        </td>
                        <td class="table-cell">{row.won}</td>
                        <For each={data().events}>
                          {(event) => (
                            <td
                              class="table-cell text-center font-bold"
                              classList={{
                                "bg-red-3": row.results[event.id] === 1,
                                "bg-gray-3":
                                  row.results[event.id] === undefined,
                              }}
                            >
                              {row.results[event.id] ?? "-"}
                            </td>
                          )}
                        </For>
                        <td
                          class="table-cell"
                          title={`${row.tieBreak.numerator}/${row.tieBreak.denominator}`}
                        >
                          {row.tieBreak.value.toFixed(3)}
                        </td>
                        <td
                          class="table-cell"
                          title={`${row.secondTieBreak.numerator}/${row.secondTieBreak.denominator}`}
                        >
                          {row.secondTieBreak.value.toFixed(3)}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          )}
        </Match>
      </Switch>
    </AdminPage>
  );
}
