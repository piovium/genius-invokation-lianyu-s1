import { For, type JSX } from "solid-js";
import { useI18n } from "../i18n";
import { formatPercent } from "./StatisticsValue";

export interface StatisticsCombinationCardProps {
  id: string;
  appearances: number;
  appearanceRate: number;
  wins: number;
  winRate: number;
  awayAppearances: number;
  awayWinRate: number;
  onClick: () => void;
}

export interface StatisticsCombinationCardItem {
  label: string;
  value: JSX.Element;
}

export const statisticsCombinationCardClass =
  "w-full rounded-lg b b-gray-2 bg-white p-3 text-left";

export function StatisticsCombinationCardContent(props: {
  id: string;
  items: StatisticsCombinationCardItem[];
}) {
  const { assetsManager } = useI18n();
  const characterIds = () => props.id.split(":").map(Number);
  const name = () =>
    characterIds()
      .map((id) => assetsManager().getNameSync(id) ?? String(id))
      .join(" / ");
  return (
    <>
      <div class="flex flex-row justify-center">
        <For each={characterIds()}>
          {(id) => (
            <img
              class="h-16 w-16 min-w-0 rounded-full bg-gray-1 object-cover b-3 b-orange-2 mr--3 last:mr-0"
              src={assetsManager().getImageUrlSync(id, { type: "icon" })}
              alt={assetsManager().getNameSync(id) ?? String(id)}
            />
          )}
        </For>
      </div>
      <div class="mb-2 min-w-0">
        <h4 class="text-base font-bold leading-snug text-center" title={name()}>
          {name()}
        </h4>
      </div>
      <dl class="grid grid-flow-col grid-rows-2 gap-x-5 gap-y-1 text-sm">
        <For each={props.items}>
          {(item) => (
            <div class="min-w-0 flex items-baseline justify-between gap-2">
              <dt class="whitespace-nowrap text-gray-5">{item.label}</dt>
              <dd class="whitespace-nowrap font-medium tabular-nums">
                {item.value}
              </dd>
            </div>
          )}
        </For>
      </dl>
    </>
  );
}

export function StatisticsCombinationCard(
  props: StatisticsCombinationCardProps,
) {
  const items = () => [
    { label: "出场数", value: String(props.appearances) },
    { label: "出场率", value: formatPercent(props.appearanceRate) },
    { label: "胜场", value: String(props.wins) },
    { label: "胜率", value: formatPercent(props.winRate) },
    { label: "外战场数", value: String(props.awayAppearances) },
    { label: "外战胜率", value: formatPercent(props.awayWinRate) },
  ];

  return (
    <button
      type="button"
      class={`${statisticsCombinationCardClass} hover:bg-gray-1`}
      onClick={props.onClick}
    >
      <StatisticsCombinationCardContent id={props.id} items={items()} />
    </button>
  );
}
