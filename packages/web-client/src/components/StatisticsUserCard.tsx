import { For } from "solid-js";
import { BACKEND_BASE_URL } from "../config";
import { formatPercent } from "./StatisticsValue";

export interface StatisticsUserCardProps {
  id: number;
  qq: string;
  name: string;
  games: number;
  wins: number;
  netWins: number;
  winRate: number;
  onClick: () => void;
}

export function StatisticsUserCard(props: StatisticsUserCardProps) {
  const items = () => [
    { label: "对局", value: String(props.games) },
    { label: "胜场", value: String(props.wins) },
    { label: "净胜场", value: String(props.netWins) },
    { label: "胜率", value: formatPercent(props.winRate) },
  ];

  return (
    <button
      type="button"
      class="min-h-28 w-full flex items-center gap-4 rounded-lg b b-gray-2 bg-white p-3 text-left hover:bg-gray-1"
      onClick={() => props.onClick()}
    >
      <img
        class="h-22 w-22 shrink-0 rounded-full bg-gray-1 object-cover b-2 b-purple-3"
        src={`${BACKEND_BASE_URL}/users/${props.id}/avatar`}
        alt={props.name}
      />
      <div class="min-w-0 flex-1 self-stretch flex flex-col justify-center">
        <div class="mb-2 min-w-0">
          <h4 class="truncate text-base font-bold" title={props.name}>
            {props.name}
          </h4>
          <p class="truncate text-xs text-gray-5">{props.qq}</p>
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
    </button>
  );
}
