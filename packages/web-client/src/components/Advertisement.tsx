import { Show, createSignal } from "solid-js";

const AD_URL =
  "https://act.miyoushe.com/ys/ugc_community/mx/#/pages/level-detail/index?id=58554827858&region=cn_gf01";

export function Advertisement() {
  const [visible, setVisible] = createSignal(true);

  return (
    <Show when={visible()}>
      <div class="relative mb-5 aspect-[6/1] w-full overflow-hidden rounded-lg bg-black">
        <a
          class="absolute inset-0 block"
          href={AD_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="你画我猜：抽象艺术家广告"
        >
          <img
            class="absolute left-1/2 top-0 h-full w-[105%] max-w-none -translate-x-1/2 object-cover object-center"
            src={`${import.meta.env.BASE_URL}avatars/ad.png`}
            alt="你画我猜：抽象艺术家，七 P 团建推荐奇域"
          />
        </a>
        <span class="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-xs text-white">
          广告
        </span>
        <button
          type="button"
          class="absolute right-1 top-1 h-7 w-7 flex items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/80"
          title="关闭广告"
          aria-label="关闭广告"
          onClick={() => setVisible(false)}
        >
          <i class="i-mdi-close text-lg" />
        </button>
      </div>
    </Show>
  );
}
