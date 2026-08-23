import { A } from "@solidjs/router";
import axios from "axios";
import { For, createResource } from "solid-js";
import type { TournamentEvent } from "../../api/models";
import { AdminPage, fmt, phaseLabel } from "./shared";

export default function AdminEvents() {
  const [events] = createResource<TournamentEvent[]>(() =>
    axios.get("admin/events").then((r) => r.data),
  );
  return (
    <AdminPage
      title="比赛场次"
      actions={
        <A class="btn btn-solid-success" href="/admin/events/new">
          <i class="i-mdi-plus" /> 创建场次
        </A>
      }
    >
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <For each={events()} fallback={<p class="text-gray-5">暂无场次。</p>}>
          {(event) => (
            <A
              href={`/admin/events/${event.id}`}
              class="rounded-xl b b-gray-2 p-4 hover:bg-gray-50"
            >
              <div class="flex justify-between gap-2">
                <h3 class="font-bold text-lg">{event.name}</h3>
                <span class="badge badge-soft-primary">
                  {phaseLabel[event.phase]}
                </span>
              </div>
              <p class="mt-2">
                {event._count?.matches ?? 0} 盘 · 牌组上限{" "}
                {event.deckLimit || "不限"}
              </p>
              <p class="text-sm text-gray-5">创建于 {fmt(event.createdAt)}</p>
            </A>
          )}
        </For>
      </div>
    </AdminPage>
  );
}
