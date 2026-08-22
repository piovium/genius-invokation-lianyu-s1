import { A } from "@solidjs/router";
import axios from "axios";
import { For, createResource } from "solid-js";
import type { AdminUser, TournamentEvent } from "../../api/models";
import { AdminPage, phaseLabel } from "./shared";

export default function AdminHome() {
  const [events] = createResource<TournamentEvent[]>(() =>
    axios.get("admin/events").then((r) => r.data),
  );
  const [users] = createResource<AdminUser[]>(() =>
    axios.get("admin/users").then((r) => r.data),
  );
  const running = () =>
    events()?.filter((e) => e.phase === "RUNNING").length ?? 0;
  const pending = () =>
    users()?.filter((u) => u.competitionStatus === "REGISTERED").length ?? 0;
  return (
    <AdminPage title="赛事管理">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div class="rounded-xl bg-blue-50 p-4">
          <b class="text-2xl">{users()?.length ?? "…"}</b>
          <p>注册用户</p>
        </div>
        <div class="rounded-xl bg-amber-50 p-4">
          <b class="text-2xl">{pending()}</b>
          <p>待确认报名</p>
        </div>
        <div class="rounded-xl bg-green-50 p-4">
          <b class="text-2xl">{running()}</b>
          <p>进行中场次</p>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <A class="btn btn-outline-primary h-14" href="/admin/users">
          用户与报名设置
        </A>
        <A class="btn btn-outline-primary h-14" href="/admin/events">
          场次与配对
        </A>
        <A class="btn btn-outline-primary h-14" href="/admin/statistics">
          业务统计
        </A>
        <A class="btn btn-outline-primary h-14" href="/admin/audit-logs">
          审计日志
        </A>
      </div>
      <h3 class="font-bold text-lg mb-2">最近场次</h3>
      <div class="flex flex-col gap-2">
        <For each={events()?.slice(0, 6)}>
          {(event) => (
            <A
              class="rounded-lg b b-gray-2 p-3 flex justify-between hover:bg-gray-50"
              href={`/admin/events/${event.id}`}
            >
              <span>{event.name}</span>
              <span class="badge badge-soft-primary">
                {phaseLabel[event.phase]}
              </span>
            </A>
          )}
        </For>
      </div>
    </AdminPage>
  );
}
