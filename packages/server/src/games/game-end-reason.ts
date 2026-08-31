export type RuntimeGameEndReason =
  "NORMAL" | "ENGINE_ERROR" | "SURRENDER" | "IO_ERROR" | "TIMEOUT";

export function ioErrorEndReason(timedOut: boolean): RuntimeGameEndReason {
  return timedOut ? "TIMEOUT" : "IO_ERROR";
}

export function resolveCountForStats(
  endReason: RuntimeGameEndReason | "ADMIN" | null | undefined,
  requested?: boolean,
) {
  if (endReason === "IO_ERROR" || endReason === "TIMEOUT") return false;
  return requested ?? endReason !== "ENGINE_ERROR";
}
