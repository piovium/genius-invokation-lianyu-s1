import axios from "axios";
import { For, createResource, createSignal } from "solid-js";
import type { AuditLog } from "../../api/models";
import { AdminPage, fmt } from "./shared";

export default function AuditLogs() {
  const [skip, setSkip] = createSignal(0);
  const [logs] = createResource(skip, (value) =>
    axios
      .get<AuditLog[]>("admin/audit-logs", {
        params: { skip: value, take: 30 },
      })
      .then((r) => r.data),
  );
  return (
    <AdminPage title="审计日志">
      <div class="flex flex-col gap-2">
        <For each={logs()}>
          {(log) => (
            <article class="rounded-xl b b-gray-2 p-4">
              <div class="flex flex-wrap justify-between gap-2">
                <div>
                  <span class="badge badge-soft-warning">{log.action}</span>{" "}
                  <b>
                    {log.targetType} #{log.targetId}
                  </b>
                </div>
                <time class="text-sm text-gray-5">{fmt(log.createdAt)}</time>
              </div>
              <p class="mt-2">
                操作者：{log.actor.name}（{log.actor.qq}）
              </p>
              <p>原因：{log.reason}</p>
              <details class="mt-2">
                <summary class="cursor-pointer text-blue-6">变更详情</summary>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  <pre class="overflow-auto bg-gray-50 p-2 text-xs">
                    变更前：{JSON.stringify(log.before, null, 2)}
                  </pre>
                  <pre class="overflow-auto bg-gray-50 p-2 text-xs">
                    变更后：{JSON.stringify(log.after, null, 2)}
                  </pre>
                </div>
              </details>
            </article>
          )}
        </For>
      </div>
      <div class="flex justify-center gap-3 mt-4">
        <button
          class="btn btn-outline"
          disabled={skip() === 0}
          onClick={() => setSkip(Math.max(0, skip() - 30))}
        >
          上一页
        </button>
        <button
          class="btn btn-outline"
          disabled={(logs()?.length ?? 0) < 30}
          onClick={() => setSkip(skip() + 30)}
        >
          下一页
        </button>
      </div>
    </AdminPage>
  );
}
