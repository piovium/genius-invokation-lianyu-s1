import { For } from "solid-js";

export interface StatisticsSortOption<T extends string> {
  value: T;
  label: string;
}

export function StatisticsListToolbar<T extends string>(props: {
  search: string;
  searchPlaceholder: string;
  sort: T;
  sortOptions: readonly StatisticsSortOption<T>[];
  onSearch: (value: string) => void;
  onSort: (value: T) => void;
}) {
  return (
    <div class="mb-3 flex items-center justify-between gap-3">
      <label class="relative block w-full max-w-96">
        <span class="sr-only">搜索</span>
        <i
          class="i-mdi-magnify pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-5"
          aria-hidden="true"
        />
        <input
          type="search"
          class="input input-solid h-10 w-full pl-9"
          value={props.search}
          placeholder={props.searchPlaceholder}
          onInput={(event) => props.onSearch(event.currentTarget.value)}
        />
      </label>
      <label class="flex shrink-0 items-center gap-2 text-sm">
        <span class="text-gray-5">按</span>
        <select
          class="h-10 rounded-lg b b-gray-3 bg-white px-3 outline-none focus:b-primary"
          value={props.sort}
          onChange={(event) => props.onSort(event.currentTarget.value as T)}
        >
          <For each={props.sortOptions}>
            {(option) => (
              <option value={option.value}>{option.label}</option>
            )}
          </For>
        </select>
        <span class="text-gray-5">降序</span>
      </label>
    </div>
  );
}
