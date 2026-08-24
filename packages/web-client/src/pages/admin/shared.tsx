import { A, useNavigate } from "@solidjs/router";
import type { JSX, ParentProps } from "solid-js";
import { For, Show, createEffect } from "solid-js";
import { Layout } from "../../layouts/Layout";
import { useAuth } from "../../auth";

export function AdminPage(
  props: ParentProps<{
    title: JSX.Element;
    breadcrumbs?: { title: JSX.Element; href: string }[];
    titleActions?: JSX.Element;
    actions?: JSX.Element;
  }>,
) {
  const auth = useAuth();
  const navigate = useNavigate();
  const admin = () => {
    const current = auth.status();
    return current.type === "user" && current.role === "ADMIN";
  };
  createEffect(() => {
    if (!auth.loading() && !admin())
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`, {
        replace: true,
      });
  });
  return (
    <Layout>
      <Show when={admin()}>
        <div class="container mx-auto h-full flex flex-col min-h-0">
          <div class="flex flex-wrap gap-3 justify-between items-center mb-4">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-2xl font-bold">
                <Show
                  when={props.title !== "赛事管理"}
                  fallback="赛事管理"
                >
                  <A class="text-blue-6 hover:underline" href="/admin">
                    赛事管理
                  </A>
                  <For each={props.breadcrumbs}>
                    {(breadcrumb) => (
                      <>
                        <span class="mx-1 text-gray-4" aria-hidden="true">
                          /
                        </span>
                        <A
                          class="text-blue-6 hover:underline"
                          href={breadcrumb.href}
                        >
                          {breadcrumb.title}
                        </A>
                      </>
                    )}
                  </For>
                  <span class="mx-1 text-gray-4" aria-hidden="true">
                    /
                  </span>
                  <span aria-current="page">{props.title}</span>
                </Show>
              </h2>
              {props.titleActions}
            </div>
            {props.actions}
          </div>
          <div class="flex-1 min-h-0 overflow-auto pb-8">{props.children}</div>
        </div>
      </Show>
    </Layout>
  );
}

export function ReasonDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  let reason = "";
  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-300 bg-black/40 flex items-center justify-center p-4"
        role="presentation"
      >
        <form
          class="bg-white rounded-xl shadow-xl p-5 w-full max-w-110"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) props.onConfirm(reason.trim());
          }}
        >
          <h3 class="text-xl font-bold">{props.title}</h3>
          <Show when={props.description}>
            <p class="my-2 text-sm text-gray-6">{props.description}</p>
          </Show>
          <label class="flex flex-col gap-1 mt-3">
            <span class="shrink-0">操作原因</span>
            <textarea
              class="min-h-24 w-full rounded-lg b b-gray-3 bg-white px-3 py-2 outline-none focus:b-primary"
              maxlength={500}
              required
              onInput={(e) => (reason = e.currentTarget.value)}
            />
          </label>
          <div class="flex justify-end gap-3 mt-4">
            <button
              type="button"
              class="btn btn-ghost"
              onClick={props.onCancel}
            >
              取消
            </button>
            <button class="btn btn-solid-error" disabled={props.busy}>
              确认操作
            </button>
          </div>
        </form>
      </div>
    </Show>
  );
}

const roomConfigDefaults = {
  initTotalActionTime: 45,
  rerollTime: 40,
  roundTotalActionTime: 60,
  actionTime: 25,
  watchable: true,
} as const;

function roomConfigValue(
  config: Record<string, unknown> | undefined,
  key: keyof typeof roomConfigDefaults,
) {
  const value = config?.[key];
  return typeof value === typeof roomConfigDefaults[key]
    ? value
    : roomConfigDefaults[key];
}

export function RoomConfigFields(props: {
  value?: Record<string, unknown>;
  class?: string;
}) {
  return (
    <fieldset class={`rounded-lg b b-gray-2 p-3 ${props.class ?? ""}`}>
      <legend class="px-2 font-bold">房间配置</legend>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="flex flex-col md:flex-row md:items-center gap-1">
          <span class="shrink-0">初始化总时间（秒）</span>
          <input
            name="roomConfig.initTotalActionTime"
            type="number"
            min="0"
            max="300"
            class="input input-solid h-10 min-w-0 flex-1"
            value={roomConfigValue(props.value, "initTotalActionTime") as number}
            required
          />
        </label>
        <label class="flex flex-col md:flex-row md:items-center gap-1">
          <span class="shrink-0">每次重投时间（秒）</span>
          <input
            name="roomConfig.rerollTime"
            type="number"
            min="25"
            max="300"
            class="input input-solid h-10 min-w-0 flex-1"
            value={roomConfigValue(props.value, "rerollTime") as number}
            required
          />
        </label>
        <label class="flex flex-col md:flex-row md:items-center gap-1">
          <span class="shrink-0">每回合总时间（秒）</span>
          <input
            name="roomConfig.roundTotalActionTime"
            type="number"
            min="0"
            max="300"
            class="input input-solid h-10 min-w-0 flex-1"
            value={roomConfigValue(props.value, "roundTotalActionTime") as number}
            required
          />
        </label>
        <label class="flex flex-col md:flex-row md:items-center gap-1">
          <span class="shrink-0">每次行动时间（秒）</span>
          <input
            name="roomConfig.actionTime"
            type="number"
            min="25"
            max="300"
            class="input input-solid h-10 min-w-0 flex-1"
            value={roomConfigValue(props.value, "actionTime") as number}
            required
          />
        </label>
      </div>
      <label class="mt-3 flex items-center gap-2">
        <input
          class="checkbox"
          name="roomConfig.watchable"
          type="checkbox"
          checked={roomConfigValue(props.value, "watchable") as boolean}
        />
        允许观战
      </label>
    </fieldset>
  );
}

export function roomConfigFromForm(form: FormData): Record<string, unknown> {
  return {
    initTotalActionTime: Number(form.get("roomConfig.initTotalActionTime")),
    rerollTime: Number(form.get("roomConfig.rerollTime")),
    roundTotalActionTime: Number(form.get("roomConfig.roundTotalActionTime")),
    actionTime: Number(form.get("roomConfig.actionTime")),
    watchable: form.get("roomConfig.watchable") === "on",
  };
}

export const phaseLabel = {
  DECK_COLLECTION: "收集牌组中",
  RUNNING: "进行中",
  FINISHED: "已结束",
} as const;
export const modeLabel = {
  UNRESTRICTED: "无限制",
  DUEL: "决斗",
  CONQUEST: "征服",
} as const;
export function fmt(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}
