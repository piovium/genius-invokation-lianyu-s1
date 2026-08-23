// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { A, useNavigate, useSearchParams } from "@solidjs/router";
import axios from "axios";
import { Match, Show, Switch, createSignal } from "solid-js";
import { useAuth } from "../auth";
import { errorMessage } from "../api/errors";
import { getPasskey, isPasskeySupported } from "../auth/passkey";

interface AuthResult {
  accessToken: string;
  userId: number;
}

type LoginMethod = "password" | "passkey" | "guest";

export function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [qq, setQq] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [guestName, setGuestName] = createSignal("");
  const [method, setMethod] = createSignal<LoginMethod>("password");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const selectMethod = (nextMethod: LoginMethod) => {
    setMethod(nextMethod);
    setError("");
  };

  const finish = () => {
    const redirect = searchParams.redirect;
    navigate(
      typeof redirect === "string" && redirect.startsWith("/") ? redirect : "/",
    );
  };

  const passwordLogin = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await auth.loginWithPassword(qq(), password());
      finish();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const passkeyLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.post<{
        challengeId: string;
        options: PublicKeyCredentialRequestOptionsJSON;
      }>("auth/login/passkey/options", { qq: qq() });
      const response = await getPasskey(data.options);
      const result = await axios.post<AuthResult>("auth/login/passkey/verify", {
        challengeId: data.challengeId,
        response,
      });
      await auth.acceptToken(result.data);
      finish();
    } catch (reason) {
      if ((reason as DOMException)?.name !== "NotAllowedError") {
        setError(errorMessage(reason));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="mx-auto w-full max-w-105 flex flex-col gap-4">
      <div class="w-full flex flex-col gap-6 rounded-lg b b-gray-2 p-6 shadow-sm">
        <div>
          <h2 class="text-2xl font-bold">登录</h2>
        </div>
        <div
          class="grid grid-cols-3 rounded-lg bg-gray-1 p-1"
          role="tablist"
          aria-label="登录方式"
        >
          <button
            id="password-tab"
            class="min-w-0 rounded-md px-2 py-2 text-sm transition-colors"
            classList={{
              "bg-white font-bold text-primary shadow-sm": method() === "password",
              "text-gray-5 hover:text-gray-7": method() !== "password",
            }}
            type="button"
            role="tab"
            aria-selected={method() === "password"}
            aria-controls="password-panel"
            onClick={() => selectMethod("password")}
          >
            密码登录
          </button>
          <button
            id="passkey-tab"
            class="min-w-0 rounded-md px-2 py-2 text-sm transition-colors"
            classList={{
              "bg-white font-bold text-primary shadow-sm": method() === "passkey",
              "text-gray-5 hover:text-gray-7": method() !== "passkey",
            }}
            type="button"
            role="tab"
            aria-selected={method() === "passkey"}
            aria-controls="passkey-panel"
            onClick={() => selectMethod("passkey")}
          >
            通行密钥
          </button>
          <button
            id="guest-tab"
            class="min-w-0 rounded-md px-2 py-2 text-sm transition-colors"
            classList={{
              "bg-white font-bold text-primary shadow-sm": method() === "guest",
              "text-gray-5 hover:text-gray-7": method() !== "guest",
            }}
            type="button"
            role="tab"
            aria-selected={method() === "guest"}
            aria-controls="guest-panel"
            onClick={() => selectMethod("guest")}
          >
            游客登录
          </button>
        </div>
        <Show when={error()}>
          <div class="alert alert-border-error" role="alert">
            <p>{error()}</p>
          </div>
        </Show>
        <Switch>
          <Match when={method() === "password"}>
            <form
              id="password-panel"
              class="flex flex-col gap-4"
              role="tabpanel"
              aria-labelledby="password-tab"
              onSubmit={passwordLogin}
            >
              <label class="flex flex-col gap-1">
                <span>QQ 号</span>
                <input
                  class="input input-solid line-height-8"
                  inputmode="numeric"
                  autocomplete="username"
                  pattern="\d{5,12}"
                  value={qq()}
                  onInput={(event) => setQq(event.currentTarget.value.trim())}
                  required
                  autofocus
                />
              </label>
              <label class="flex flex-col gap-1">
                <span>密码</span>
                <input
                  class="input input-solid line-height-8"
                  type="password"
                  autocomplete="current-password"
                  value={password()}
                  onInput={(event) => setPassword(event.currentTarget.value)}
                  required
                />
              </label>
              <p class="text-xs text-gray-5">请输入本站密码，不是你的 QQ 密码。</p>
              <button
                class="btn btn-solid-primary w-full"
                type="submit"
                disabled={busy()}
              >
                {busy() ? "正在登录…" : "密码登录"}
              </button>
            </form>
          </Match>
          <Match when={method() === "passkey"}>
            <form
              id="passkey-panel"
              class="flex flex-col gap-4"
              role="tabpanel"
              aria-labelledby="passkey-tab"
              onSubmit={(event) => {
                event.preventDefault();
                void passkeyLogin();
              }}
            >
              <label class="flex flex-col gap-1">
                <span>QQ 号</span>
                <input
                  class="input input-solid line-height-8"
                  inputmode="numeric"
                  autocomplete="username webauthn"
                  pattern="\d{5,12}"
                  value={qq()}
                  onInput={(event) => setQq(event.currentTarget.value.trim())}
                  required
                  autofocus
                />
              </label>
              <p class="text-xs text-gray-5">
                使用已绑定到此账号的设备通行密钥完成验证。
              </p>
              <button
                class="btn btn-solid-primary w-full"
                type="submit"
                disabled={busy() || !isPasskeySupported()}
                title={
                  isPasskeySupported()
                    ? ""
                    : "当前环境不支持通行密钥，请使用密码"
                }
              >
                {busy() ? "正在验证…" : "使用通行密钥登录"}
              </button>
            </form>
          </Match>
          <Match when={method() === "guest"}>
            <form
              id="guest-panel"
              class="flex flex-col gap-4"
              role="tabpanel"
              aria-labelledby="guest-tab"
              onSubmit={(event) => {
                event.preventDefault();
                auth.loginGuest(guestName().trim());
                finish();
              }}
            >
              <label class="flex flex-col gap-1">
                <span>游客昵称</span>
                <input
                  class="input input-solid line-height-8"
                  maxlength={64}
                  value={guestName()}
                  onInput={(event) => setGuestName(event.currentTarget.value)}
                  required
                  autofocus
                />
              </label>
              <p class="text-xs text-gray-5">
                游客牌组只保存在此浏览器；游客对局仍会保存匿名统计快照。
              </p>
              <button
                class="btn btn-solid-primary w-full"
                type="submit"
                disabled={!guestName().trim()}
              >
                以游客身份登录
              </button>
            </form>
          </Match>
        </Switch>
      </div>
      <div class="h-12 w-full px-6">
        <A
          class="btn btn-solid-green w-full shadow-sm"
          href="/register"
        >
          注册账号
        </A>
      </div>
    </div>
  );
}
