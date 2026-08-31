import { describe, expect, it } from "vitest";
import { ioErrorEndReason, resolveCountForStats } from "./game-end-reason";

describe("game end reasons", () => {
  it("distinguishes player I/O errors from guest timeouts", () => {
    expect(ioErrorEndReason(false)).toBe("IO_ERROR");
    expect(ioErrorEndReason(true)).toBe("TIMEOUT");
  });

  it.each(["IO_ERROR", "TIMEOUT"] as const)(
    "never counts %s games for statistics",
    (endReason) => {
      expect(resolveCountForStats(endReason)).toBe(false);
      expect(resolveCountForStats(endReason, true)).toBe(false);
    },
  );

  it("preserves the existing defaults for other endings", () => {
    expect(resolveCountForStats("NORMAL")).toBe(true);
    expect(resolveCountForStats("SURRENDER")).toBe(true);
    expect(resolveCountForStats("ENGINE_ERROR")).toBe(false);
  });
});
