// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import { A, useNavigate, useSearchParams } from "@solidjs/router";
import axios from "axios";
import { Show, createSignal } from "solid-js";
import { useAuth } from "../auth";
import { errorMessage } from "../api/errors";
import { getPasskey, isPasskeySupported } from "../auth/passkey";

interface AuthResult {
  accessToken: string;
  userId: number;
}

export function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [qq, setQq] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [guestName, setGuestName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

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
    <div class="w-full max-w-105 flex flex-col gap-6 rounded-xl b b-gray-2 p-6 shadow-sm">
      <div>
        <h2 class="text-2xl font-bold">QQ 账号登录</h2>
        <p class="mt-1 text-sm text-gray-5">管理员与参赛用户使用同一入口。</p>
      </div>
      <Show when={error()}>
        <div class="alert alert-border-error" role="alert">
          <p>{error()}</p>
        </div>
      </Show>
      <form class="flex flex-col gap-4" onSubmit={passwordLogin}>
        <label class="flex flex-col gap-1">
          <span>QQ 号</span>
          <input
            class="input input-solid"
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
          <span>密码（防傻子环节：不是你的 QQ 密码）</span>
          <input
            class="input input-solid"
            type="password"
            autocomplete="current-password"
            value={password()}
            onInput={(event) => setPassword(event.currentTarget.value)}
            required
          />
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button class="btn btn-solid-primary" type="submit" disabled={busy()}>
            {busy() ? "正在登录…" : "密码登录"}
          </button>
          <button
            class="btn btn-outline-primary"
            type="button"
            disabled={
              busy() || !/^\d{5,12}$/.test(qq()) || !isPasskeySupported()
            }
            title={
              isPasskeySupported()
                ? ""
                : "当前环境不支持通行秘钥，请使用密码"
            }
            onClick={passkeyLogin}
          >
            使用通行秘钥
          </button>
        </div>
      </form>
      <p class="text-center text-sm">
        还没有账号？
        <A class="text-blue-6 hover:underline" href="/register">
          注册账号
        </A>
      </p>
      <div class="flex items-center gap-3 text-gray-4">
        <hr class="flex-1" />
        <span>或游客模式</span>
        <hr class="flex-1" />
      </div>
      <form
        class="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          auth.loginGuest(guestName().trim());
          finish();
        }}
      >
        <input
          class="input input-solid flex-1 min-w-0"
          maxlength={64}
          placeholder="游客昵称"
          value={guestName()}
          onInput={(event) => setGuestName(event.currentTarget.value)}
          required
        />
        <button class="btn btn-outline" disabled={!guestName().trim()}>
          继续
        </button>
      </form>
      <p class="text-xs text-gray-5">
        游客牌组只保存在此浏览器；游客对局仍会保存匿名统计快照。
      </p>
    </div>
  );
}
