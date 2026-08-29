import { Show } from "solid-js";

export const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

export const formatRate = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : formatPercent(value);

export const formatQuantity = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : value.toFixed(2);

export function StatisticsRateWithDelta(props: {
  value: number | null | undefined;
  baseline: number | null | undefined;
}) {
  const difference = () =>
    props.value === null ||
    props.value === undefined ||
    props.baseline === null ||
    props.baseline === undefined
      ? null
      : props.value - props.baseline;
  const color = () => {
    const value = difference();
    if (value === null || Math.abs(value) < 0.000_001) return "text-gray-5";
    return value > 0 ? "text-success" : "text-error";
  };
  return (
    <>
      {formatRate(props.value)}
      <Show when={difference() !== null}>
        <span class={`ml-1 text-xs ${color()}`}>
          {difference()! > 0 ? "+" : ""}
          {(difference()! * 100).toFixed(1)}%
        </span>
      </Show>
    </>
  );
}
