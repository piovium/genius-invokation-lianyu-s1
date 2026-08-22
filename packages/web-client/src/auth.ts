// Copyright (C) 2024-2026 Guyutongxue
// SPDX-License-Identifier: AGPL-3.0-or-later

import axios from "axios";
import {
  type Accessor,
  type ParentProps,
  createContext,
  createComponent,
  createResource,
  useContext,
} from "solid-js";
import { GuestInfo, useGuestInfo } from "./guest";
import { EMPTY_IMAGE, getQqAvatarUrl, getRandomAvatar } from "./utils";

export type CompetitionStatus = "NONE" | "REGISTERED" | "PLAYER";

export interface UserInfo {
  type: "user";
  id: number;
  qq: string;
  login: string;
  name: string;
  avatarUrl: string;
  chessboardColor: string | null;
  role: "USER" | "ADMIN";
  competitionStatus: CompetitionStatus;
  appliedAt: string | null;
  queuePosition: number | null;
  waitlisted: boolean;
  activeMatchId: number | null;
}

const NOT_LOGIN = {
  type: "notLogin",
  name: "",
  id: null,
  chessboardColor: null,
} as const;

type NotLogin = typeof NOT_LOGIN;
export type AuthStatus = UserInfo | GuestInfo | NotLogin;

export interface UpdateInfoPatch {
  name?: string;
  avatarUrl?: string | null;
  chessboardColor?: string | null;
}

interface AuthResult {
  accessToken: string;
  userId: number;
}

export interface Auth {
  readonly status: Accessor<AuthStatus>;
  readonly loading: Accessor<boolean>;
  readonly error: Accessor<unknown>;
  readonly refresh: () => Promise<void>;
  readonly loginWithPassword: (qq: string, password: string) => Promise<void>;
  readonly acceptToken: (result: AuthResult) => Promise<void>;
  readonly loginGuest: (name: string) => void;
  readonly setGuestId: (id: string) => void;
  readonly avatarUrl: () => string;
  readonly updateInfo: (patch: UpdateInfoPatch) => Promise<void>;
  readonly logout: () => Promise<void>;
}

const AuthContext = createContext<Auth>();

export function AuthProvider(props: ParentProps) {
  const [guestInfo, setGuestInfo] = useGuestInfo();
  const [user, { refetch: refetchUser, mutate }] = createResource<
    UserInfo | NotLogin
  >(
    () =>
      axios.get<Omit<UserInfo, "type"> | null>("users/me").then(({ data }) =>
        data
          ? {
              ...data,
              type: "user" as const,
              name: data.name ?? data.qq,
            }
          : NOT_LOGIN,
      ),
    { initialValue: NOT_LOGIN },
  );

  const acceptToken = async (result: AuthResult) => {
    localStorage.setItem("accessToken", result.accessToken);
    setGuestInfo(null);
    await refetchUser();
  };

  const auth: Auth = {
    status: () => {
      const formalUser = user();
      if (formalUser.type === "user") return formalUser;
      return guestInfo() ?? formalUser;
    },
    loading: () => guestInfo() === null && user.loading,
    error: () => (guestInfo() === null ? user.error : undefined),
    refresh: async () => {
      await refetchUser();
    },
    loginWithPassword: async (qq, password) => {
      const { data } = await axios.post<AuthResult>("auth/login/password", {
        qq,
        password,
      });
      await acceptToken(data);
    },
    acceptToken,
    loginGuest: (name) => {
      localStorage.removeItem("accessToken");
      mutate(NOT_LOGIN);
      setGuestInfo({
        type: "guest",
        name,
        id: null,
        avatarUrl: null,
        chessboardColor: null,
      });
    },
    avatarUrl: () => {
      const current = auth.status();
      if (current.type === "guest") {
        return current.avatarUrl ?? getRandomAvatar(current.name);
      }
      if (current.type === "user") {
        return current.avatarUrl || getQqAvatarUrl(current.qq);
      }
      return EMPTY_IMAGE;
    },
    setGuestId: (id) => {
      setGuestInfo((old) => old && { ...old, id });
    },
    updateInfo: async (patch) => {
      const current = auth.status();
      if (current.type === "guest") {
        setGuestInfo({ ...current, ...patch });
      } else if (current.type === "user") {
        await axios.patch("users/me", patch);
        await refetchUser();
      }
    },
    logout: async () => {
      localStorage.removeItem("accessToken");
      setGuestInfo(null);
      mutate(NOT_LOGIN);
      await refetchUser();
    },
  };

  return createComponent(AuthContext.Provider, {
    value: auth,
    get children() {
      return props.children;
    },
  });
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used under AuthProvider");
  return auth;
}
