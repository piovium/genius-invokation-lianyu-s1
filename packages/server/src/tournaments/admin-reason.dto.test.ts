import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  OptionalReasonDto,
  ReasonDto,
  StatusBatchDto,
} from "./admin-reason.dto";

describe("admin audit reason validation", () => {
  it("allows normal operations to omit a reason", async () => {
    const dto = plainToInstance(OptionalReasonDto, {});

    expect(await validate(dto)).toHaveLength(0);
  });

  it("rejects blank reasons when a reason is required", async () => {
    const missing = plainToInstance(ReasonDto, {});
    const blank = plainToInstance(ReasonDto, { reason: "   " });

    expect(await validate(missing)).not.toHaveLength(0);
    expect(await validate(blank)).not.toHaveLength(0);
  });

  it("only requires a batch reason for cancellation or withdrawal", async () => {
    const promote = plainToInstance(StatusBatchDto, {
      userIds: [1],
      status: "PLAYER",
    });
    const cancel = plainToInstance(StatusBatchDto, {
      userIds: [1],
      status: "NONE",
    });

    expect(await validate(promote)).toHaveLength(0);
    expect(await validate(cancel)).not.toHaveLength(0);
  });
});
