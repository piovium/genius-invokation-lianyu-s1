import { A, useLocation } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth } from "../auth";

export function BottomNavigation() {
  const { status } = useAuth();
  const location = useLocation();
  const profileHref = () =>
    status().type === "guest" ? "/user/guest" : `/user/${status().id}`;
  const visible = () =>
    status().type !== "notLogin" &&
    location.pathname !== "/login" &&
    location.pathname !== "/register";
  const items = () => [
    {
      label: "比赛",
      href: "/competition",
      icon: "i-mdi-trophy-outline",
      active: location.pathname === "/competition",
    },
    {
      label: "对局大厅",
      href: "/",
      icon: "i-mdi-sword-cross",
      active:
        location.pathname === "/" || location.pathname.startsWith("/rooms/"),
    },
    {
      label: "我的牌组",
      href: "/decks",
      icon: "i-mdi-cards-outline",
      active: location.pathname.startsWith("/decks"),
    },
    {
      label: "个人信息",
      href: profileHref(),
      icon: "i-mdi-account-outline",
      active: location.pathname === profileHref(),
    },
  ];

  return (
    <Show when={visible()}>
      <div class="h-[calc(4rem+var(--root-padding-bottom))] shrink-0 md:hidden" />
      <nav
        class="fixed inset-x-0 bottom-0 z-200 grid h-[calc(4rem+var(--root-padding-bottom))] grid-cols-4 b-t b-gray-2 bg-white pb-[var(--root-padding-bottom)] shadow-[0_-2px_8px_#00000012] md:hidden"
        aria-label="主要导航"
      >
        <For each={items()}>
          {(item) => (
            <A
              href={item.href}
              class="min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 text-xs text-gray-5"
              classList={{ "font-bold text-purple-7": item.active }}
              aria-current={item.active ? "page" : undefined}
            >
              <i class={`${item.icon} text-xl`} />
              <span class="w-full truncate text-center">{item.label}</span>
            </A>
          )}
        </For>
      </nav>
    </Show>
  );
}
