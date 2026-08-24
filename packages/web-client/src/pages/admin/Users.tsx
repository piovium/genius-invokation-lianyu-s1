import axios from "axios";
import { For, Show, createResource, createSignal } from "solid-js";
import type {
  AdminUser,
  CompetitionStatus,
  RegistrationSettings,
} from "../../api/models";
import { errorMessage } from "../../api/errors";
import { AdminPage, ReasonDialog, fmt } from "./shared";

const statusText = {
  NONE: "未报名",
  REGISTERED: "已报名",
  PLAYER: "参赛选手",
} as const;
function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function AdminUsers() {
  const [filter, setFilter] = createSignal<CompetitionStatus | "">("");
  const [descending, setDescending] = createSignal(false);
  const [users, { refetch }] = createResource(
    () => [filter(), descending()] as const,
    ([status, desc]) =>
      axios
        .get<AdminUser[]>("admin/users", {
          params: { status: status || undefined, descending: desc },
        })
        .then((r) => r.data),
  );
  const [settings, { refetch: refetchSettings }] =
    createResource<RegistrationSettings>(() =>
      axios.get("admin/registration/settings").then((r) => r.data),
    );
  const [selected, setSelected] = createSignal<number[]>([]);
  const [target, setTarget] = createSignal<CompetitionStatus | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [result, setResult] = createSignal("");

  const batch = async (status: CompetitionStatus, reason?: string) => {
    setBusy(true);
    try {
      const { data } = await axios.patch<{
        results: { userId: number; ok: boolean; error?: string }[];
      }>("admin/users/competition-status", {
        userIds: selected(),
        status,
        ...(reason ? { reason } : {}),
      });
      const failed = data.results.filter((item) => !item.ok);
      setSelected(failed.map((item) => item.userId));
      setResult(
        `成功 ${data.results.length - failed.length} 人，失败 ${failed.length} 人${failed.length ? `：${failed.map((x) => `#${x.userId} ${x.error}`).join("；")}` : "。"}`,
      );
      setTarget(null);
      refetch();
    } catch (e) {
      setResult(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (event: SubmitEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    setBusy(true);
    try {
      const opens = String(form.get("opensAt") ?? "");
      const cutoff = String(form.get("cutoffAt") ?? "");
      if (
        opens &&
        cutoff &&
        new Date(opens).getTime() >= new Date(cutoff).getTime()
      ) {
        setResult("报名开始时间必须早于报名截止时间。");
        return;
      }
      await axios.patch("admin/registration/settings", {
        opensAt: opens ? new Date(opens).toISOString() : null,
        cutoffAt: cutoff ? new Date(cutoff).toISOString() : null,
        limit: Number(form.get("limit")),
      });
      setResult("报名设置已保存。");
      refetchSettings();
    } catch (e) {
      setResult(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage title="用户与报名管理">
      <form
        class="rounded-xl b b-gray-2 p-4 mb-4 flex flex-col md:flex-row md:items-center gap-3"
        onSubmit={saveSettings}
      >
        <label class="flex flex-col md:flex-row md:items-center gap-1 flex-1">
          <span class="shrink-0">报名开始时间</span>
          <input
            name="opensAt"
            type="datetime-local"
            class="input input-solid h-10"
            value={localInput(settings()?.opensAt ?? null)}
          />
        </label>
        <label class="flex flex-col md:flex-row md:items-center gap-1 flex-1">
          <span class="shrink-0">报名截止时间</span>
          <input
            name="cutoffAt"
            type="datetime-local"
            class="input input-solid h-10"
            value={localInput(settings()?.cutoffAt ?? null)}
          />
        </label>
        <label class="flex flex-col md:flex-row md:items-center gap-1 flex-1">
          <span class="shrink-0">报名限额（0 不限）</span>
          <input
            name="limit"
            type="number"
            min="0"
            class="input input-solid h-10"
            value={settings()?.limit ?? 0}
            required
          />
        </label>
        <button class="btn btn-solid-primary" disabled={busy()}>
          保存设置
        </button>
      </form>
      <div class="flex flex-wrap gap-3 items-end mb-3">
        <label class="flex flex-col md:flex-row md:items-center gap-1 flex-1">
          <span class="shrink-0">报名状态</span>
          <select
            class="b-1 rounded-full px-2 py-1"
            value={filter()}
            onChange={(e) => {
              setFilter(e.currentTarget.value as CompetitionStatus | "");
              setSelected([]);
            }}
          >
            <option value="">全部</option>
            <option value="NONE">未报名</option>
            <option value="REGISTERED">已报名</option>
            <option value="PLAYER">参赛选手</option>
          </select>
        </label>
        <label class="flex gap-2 items-center">
          <input
            class="checkbox"
            type="checkbox"
            checked={descending()}
            onChange={(e) => setDescending(e.currentTarget.checked)}
          />{" "}
          报名时间倒序
        </label>
        <span class="flex-1" />
        <button
          class="btn btn-outline-green"
          disabled={busy() || !selected().length}
          onClick={() => {
            if (confirm(`确认将 ${selected().length} 位用户设为参赛选手？`))
              void batch("PLAYER");
          }}
        >
          设为参赛选手
        </button>
        <button
          class="btn btn-outline-red"
          disabled={!selected().length}
          onClick={() => setTarget("NONE")}
        >
          取消报名 / 强制退赛
        </button>
      </div>
      <Show when={result()}>
        <div class="alert alert-border-info mb-3">
          <p>{result()}</p>
        </div>
      </Show>
      <div class="overflow-x-auto table-root">
        <table class="table w-full">
          <thead class="table-header">
            <tr class="table-row">
              <th class="table-head">
                <input
                  class="checkbox"
                  type="checkbox"
                  checked={
                    !!users()?.length && selected().length === users()?.length
                  }
                  onChange={(e) =>
                    setSelected(
                      e.currentTarget.checked
                        ? (users() ?? []).map((u) => u.id)
                        : [],
                    )
                  }
                />
              </th>
              <th class="table-head">昵称 / QQ</th>
              <th class="table-head">角色</th>
              <th class="table-head">报名状态</th>
              <th class="table-head">报名时间</th>
              <th class="table-head">活跃盘次 / 内存对局</th>
              <th class="table-head">注册时间</th>
            </tr>
          </thead>
          <tbody class="table-body">
            <For each={users()}>
              {(user) => (
                <tr class="table-row">
                  <td class="table-cell">
                    <input
                      type="checkbox"
                      class="checkbox"
                      checked={selected().includes(user.id)}
                      onChange={(e) =>
                        setSelected(
                          e.currentTarget.checked
                            ? [...selected(), user.id]
                            : selected().filter((id) => id !== user.id),
                        )
                      }
                    />
                  </td>
                  <td class="table-cell">
                    <b>{user.name}</b>
                    <br />
                    <span class="text-sm text-gray-5">{user.qq}</span>
                  </td>
                  <td class="table-cell">{user.role}</td>
                  <td class="table-cell">
                    {statusText[user.competitionStatus]}
                  </td>
                  <td class="table-cell">{fmt(user.appliedAt)}</td>
                  <td class="table-cell">
                    {user.activeMatchId ? `#${user.activeMatchId}` : "—"}
                    <Show when={user.inRunningGame}>
                      <span class="badge badge-soft-error ml-2">运行中</span>
                    </Show>
                  </td>
                  <td class="table-cell">{fmt(user.createdAt)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <ReasonDialog
        open={target() === "NONE"}
        title="取消报名 / 强制退赛"
        description={`将处理 ${selected().length} 位用户`}
        busy={busy()}
        onCancel={() => setTarget(null)}
        onConfirm={(reason) => batch("NONE", reason)}
      />
    </AdminPage>
  );
}
