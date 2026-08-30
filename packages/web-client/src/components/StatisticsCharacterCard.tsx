import { For } from "solid-js";
import { useI18n } from "../i18n";
import { formatPercent } from "./StatisticsValue";

export interface StatisticsCharacterCardProps {
  id: number;
  appearances: number;
  appearanceRate: number;
  wins: number;
  winRate: number;
}

export function StatisticsCharacterCard(props: StatisticsCharacterCardProps) {
  const { assetsManager } = useI18n();
  const name = () => assetsManager().getNameSync(props.id) ?? String(props.id);
  const items = () => [
    { label: "出场数", value: String(props.appearances) },
    { label: "出场率", value: formatPercent(props.appearanceRate) },
    { label: "胜场", value: String(props.wins) },
    { label: "胜率", value: formatPercent(props.winRate) },
  ];

  return (
    <article class="min-h-28 flex items-center gap-4 rounded-lg b b-gray-2 bg-white p-3">
      <img
        class="h-22 w-22 shrink-0 rounded-full bg-gray-1 object-cover b-2 b-purple-3"
        src={assetsManager().getImageUrlSync(props.id, { type: "icon" })}
        alt={name()}
      />
      <div class="min-w-0 flex-1 self-stretch flex flex-col justify-center">
        <div class="mb-2 min-w-0">
          <h4 class="truncate text-base font-bold" title={name()}>
            {name()}
            <span class="text-xs text-gray-4 ms-1">{props.id}</span>
          </h4>
        </div>
        <dl class="grid grid-flow-col grid-rows-2 gap-x-5 gap-y-1 text-sm">
          <For each={items()}>
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
      </div>
    </article>
  );
}
