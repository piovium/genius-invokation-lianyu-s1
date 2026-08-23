import { A, useNavigate, useSearchParams } from "@solidjs/router";
import axios from "axios";
import {
  Show,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { Layout } from "../layouts/Layout";
import { useAuth } from "../auth";
import { useGuestDecks } from "../guest";
import { errorMessage } from "../api/errors";
import { createPasskey, isPasskeySupported } from "../auth/passkey";
import type { RegistrationSettings } from "../api/models";

interface AuthResult {
  accessToken: string;
  userId: number;
}
const qrCode = new URL(
  "../../../../docs/lianyu-s1/qq_group.png",
  import.meta.url,
).href;

export default function Register() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [params] = useSearchParams();
  const [guestDecks, { clearGuestDecks }] = useGuestDecks();
  const [settings, { refetch: refetchSettings }] = createResource(() =>
    axios
      .get<RegistrationSettings>("registration/settings")
      .then((r) => r.data),
  );
  const [qq, setQq] = createSignal(
    typeof params.qq === "string" ? params.qq : "",
  );
  const [name, setName] = createSignal(
    typeof params.name === "string" ? params.name : "",
  );
  const [code, setCode] = createSignal(
    typeof params.code === "string" ? params.code : "",
  );
  const [password, setPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [method, setMethod] = createSignal<"password" | "passkey">("password");
  const [qqChecked, setQqChecked] = createSignal(false);
  const [apply, setApply] = createSignal(false);
  const [acknowledged, setAcknowledged] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  let helpDialog!: HTMLDialogElement;

  createEffect(() => {
    const current = settings();
    if (!current) return;
    setApply(current.isOpen ?? true);
    const now = Date.now();
    const nextBoundary = [current.opensAt, current.cutoffAt]
      .filter((value): value is string => !!value)
      .map((value) => new Date(value).getTime())
      .filter((value) => value > now)
      .sort((a, b) => a - b)[0];
    if (nextBoundary === undefined) return;
    const timer = window.setTimeout(
      () => void refetchSettings(),
      Math.min(nextBoundary - now + 50, 2_147_483_647),
    );
    onCleanup(() => window.clearTimeout(timer));
  });

  const checkQq = async () => {
    setBusy(true);
    setError("");
    setQqChecked(false);
    try {
      const { data } = await axios.post<{
        qq: string;
        name?: string;
        nickname?: string;
        available: boolean;
      }>("auth/registration/qq-check", { qq: qq() });
      if (!data.available) throw new Error("该 QQ 已注册，请直接登录");
      setQq(data.qq);
      if (!name()) setName(data.name ?? data.nickname ?? "");
      setQqChecked(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const finishRegistration = async (result: AuthResult) => {
    const snapshot = guestDecks().map(({ id, name, characters, cards }) => ({
      clientImportKey: String(id),
      name,
      characters: [...characters],
      cards: [...cards],
    }));
    await auth.acceptToken(result);
    if (snapshot.length) {
      try {
        await axios.post("decks/import", { decks: snapshot });
        clearGuestDecks();
      } catch (reason) {
        alert(
          `账号已注册，但游客牌组导入失败，牌组仍保留在本机：${errorMessage(reason)}`,
        );
      }
    }
    navigate("/");
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!acknowledged()) {
      setError("请先确认已知晓比赛需在模拟器中进行");
      return;
    }
    if (method() === "password" && password() !== confirmPassword()) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    const registration = {
      qq: qq(),
      registrationCode: code(),
      name: name().trim(),
      apply: apply(),
      acknowledged: acknowledged(),
    };
    try {
      if (method() === "password") {
        const { data } = await axios.post<AuthResult>(
          "auth/register/password",
          { ...registration, password: password() },
        );
        await finishRegistration(data);
      } else {
        const { data } = await axios.post<{
          challengeId: string;
          options: PublicKeyCredentialCreationOptionsJSON;
        }>("auth/register/passkey/options", registration);
        const response = await createPasskey(data.options);
        const verified = await axios.post<AuthResult>(
          "auth/register/passkey/verify",
          { challengeId: data.challengeId, response },
        );
        await finishRegistration(verified.data);
      }
    } catch (reason) {
      if ((reason as DOMException)?.name !== "NotAllowedError")
        setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout pageScroll>
      <div class="mx-auto max-w-125 pb-8">
        <h2 class="text-2xl font-bold mb-5">注册恋雨杯账号</h2>
        <Show when={error()}>
          <div class="alert alert-border-error mb-4" role="alert">
            <p>{error()}</p>
          </div>
        </Show>
        <form class="flex flex-col gap-4" onSubmit={submit}>
          <label class="flex flex-col gap-1">
            <span>QQ 号</span>
            <div class="flex gap-2">
              <input
                class="input input-solid flex-1"
                inputmode="numeric"
                pattern="\d{5,12}"
                value={qq()}
                onInput={(e) => {
                  setQq(e.currentTarget.value.trim());
                  setQqChecked(false);
                }}
                required
              />
              <button
                type="button"
                class="btn btn-outline-primary"
                onClick={checkQq}
                disabled={busy() || !/^\d{5,12}$/.test(qq())}
              >
                {qqChecked() ? "已验证" : "验证群成员"}
              </button>
            </div>
          </label>
          <label class="flex flex-col gap-1">
            <span>
              注册码{" "}
              <button
                type="button"
                class="text-blue-6 text-sm hover:underline"
                onClick={() => helpDialog.showModal()}
              >
                如何获取？
              </button>
            </span>
            <input
              class="input input-solid"
              value={code()}
              onInput={(e) => setCode(e.currentTarget.value.trim())}
              disabled={!qqChecked()}
              required
            />
          </label>
          <label class="flex flex-col gap-1">
            <span>昵称</span>
            <input
              class="input input-solid"
              maxlength={64}
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              disabled={!qqChecked()}
              required
            />
          </label>
          <fieldset class="b b-gray-2 rounded-lg p-3">
            <legend class="px-2">认证方式</legend>
            <div class="flex gap-5">
              <label>
                <input
                  type="radio"
                  name="method"
                  checked={method() === "password"}
                  onChange={() => setMethod("password")}
                />{" "}
                密码
              </label>
              <label
                title={isPasskeySupported() ? "" : "当前环境不支持 Passkey"}
              >
                <input
                  type="radio"
                  name="method"
                  checked={method() === "passkey"}
                  onChange={() => setMethod("passkey")}
                  disabled={!isPasskeySupported()}
                />{" "}
                Passkey
              </label>
            </div>
          </fieldset>
          <Show when={method() === "password"}>
            <label class="flex flex-col gap-1">
              <span>密码（至少 8 位）</span>
              <input
                class="input input-solid"
                type="password"
                autocomplete="new-password"
                minlength={8}
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                required
              />
            </label>
            <label class="flex flex-col gap-1">
              <span>确认密码</span>
              <input
                class="input input-solid"
                type="password"
                autocomplete="new-password"
                minlength={8}
                value={confirmPassword()}
                onInput={(e) => setConfirmPassword(e.currentTarget.value)}
                required
              />
            </label>
          </Show>
          <label class="flex gap-2 items-start">
            <input
              type="checkbox"
              checked={apply()}
              onChange={(e) => setApply(e.currentTarget.checked)}
              disabled={settings()?.isOpen === false}
            />
            <span>
              同时报名参赛
              <Show when={settings()?.state === "NOT_STARTED"}>
                （报名尚未开始）
              </Show>
              <Show when={settings()?.state === "CLOSED"}>（报名已截止）</Show>
            </span>
          </label>
          <label class="flex gap-2 items-start">
            <input
              type="checkbox"
              checked={acknowledged()}
              onChange={(e) => setAcknowledged(e.currentTarget.checked)}
              required
            />
            <span>我已知晓比赛需在本模拟器中进行</span>
          </label>
          <button
            class="btn btn-solid-primary"
            disabled={busy() || !qqChecked()}
          >
            {busy()
              ? "正在注册…"
              : method() === "passkey"
                ? "创建 Passkey 并注册"
                : "注册"}
          </button>
        </form>
        <p class="mt-4 text-sm text-center">
          已有账号？
          <A class="text-blue-6 hover:underline" href="/login">
            返回登录
          </A>
        </p>
      </div>
      <dialog
        ref={helpDialog}
        class="rounded-xl shadow-xl p-6 max-w-100 w-[calc(100%-2rem)]"
      >
        <h3 class="text-xl font-bold">获取注册码</h3>
        <p class="my-3">加入赛事群后，向群内 Bot 发起私聊获取注册码。</p>
        <img
          src={qrCode}
          alt="恋雨杯赛事 QQ 群二维码"
          class="w-full max-w-72 mx-auto"
        />
        <a
          class="btn btn-outline-primary w-full mt-4"
          target="_blank"
          href="https://qm.qq.com/q/svHK8eJulW"
        >
          点击加入 QQ 群
        </a>
        <button
          class="btn btn-ghost mt-3 w-full"
          onClick={() => helpDialog.close()}
        >
          关闭
        </button>
      </dialog>
    </Layout>
  );
}
