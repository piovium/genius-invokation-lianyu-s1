import axios from "axios";
import {
  Show,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { useAuth, type UserInfo } from "../auth";
import type { RegistrationSettings } from "../api/models";
import { errorMessage } from "../api/errors";

export function RegistrationBanner() {
  const auth = useAuth();
  const [settings, { refetch }] = createResource(() =>
    axios
      .get<RegistrationSettings>("registration/settings")
      .then((r) => r.data),
  );
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const user = (): UserInfo | null => {
    const current = auth.status();
    return current.type === "user" ? current : null;
  };
  createEffect(() => {
    const current = settings();
    if (!current) return;
    const now = Date.now();
    const nextBoundary = [current.opensAt, current.cutoffAt]
      .filter((value): value is string => !!value)
      .map((value) => new Date(value).getTime())
      .filter((value) => value > now)
      .sort((a, b) => a - b)[0];
    if (nextBoundary === undefined) return;
    const timer = window.setTimeout(
      () => void refetch(),
      Math.min(nextBoundary - now + 50, 2_147_483_647),
    );
    onCleanup(() => window.clearTimeout(timer));
  });
  const registrationMessage = () => {
    const current = settings();
    if (!current || current.isOpen !== false) {
      return "报名开放中！";
    }
    if (current.state === "NOT_STARTED" && current.opensAt) {
      return `报名将于 ${new Date(current.opensAt).toLocaleString()} 开始`;
    }
    if (current.cutoffAt) {
      return `报名已于 ${new Date(current.cutoffAt).toLocaleString()} 截止`;
    }
    return "当前不在报名时间内。";
  };

  const apply = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { data } = await axios.post<{
        position: number;
        waitlisted: boolean;
        limit: number;
      }>("users/me/registration");
      setMessage(
        data.waitlisted
          ? `当前报名人数已满，您已进入候补但不保证参赛。`
          : `报名成功！`,
      );
      await auth.refresh();
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    const current = user();
    if (
      !current ||
      !confirm(
        current.competitionStatus === "PLAYER"
          ? "确认退赛？该操作不会自动终止开放对局。"
          : "确认取消报名？",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await axios.delete("users/me/registration");
      await auth.refresh();
      setMessage("已退出本届赛事。");
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Show when={user()}>
      {(current) => (
        <section class="mb-5 rounded-xl b-2 b-amber-3 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <div class="font-bold text-lg">恋雨杯 S1</div>
            <Show when={current().competitionStatus === "NONE"}>
              <p>{registrationMessage()}</p>
            </Show>
            <Show when={current().competitionStatus === "REGISTERED"}>
              <p>
                已报名 ·{" "}
                {current().appliedAt
                  ? new Date(current().appliedAt!).toLocaleString()
                  : "等待管理员确认参赛"}{" "}
                <Show when={current().waitlisted}>
                  <span class="badge badge-soft-warning">候补</span>
                </Show>
              </p>
            </Show>
            <Show when={current().competitionStatus === "PLAYER"}>
              <p>
                <span class="badge badge-soft-success">参赛选手</span>{" "}
              </p>
            </Show>
            <Show when={message()}>
              <p class="mt-1 text-sm text-amber-8" role="status">
                {message()}
              </p>
            </Show>
          </div>
          <Show
            when={current().competitionStatus === "NONE"}
            fallback={
              <button
                class="btn btn-outline-red"
                disabled={busy()}
                onClick={withdraw}
              >
                {current().competitionStatus === "PLAYER" ? "退赛" : "取消报名"}
              </button>
            }
          >
            <button
              class="btn btn-solid-primary"
              disabled={busy() || settings()?.isOpen === false}
              onClick={apply}
            >
              {busy() ? "提交中…" : "报名参赛"}
            </button>
          </Show>
        </section>
      )}
    </Show>
  );
}
