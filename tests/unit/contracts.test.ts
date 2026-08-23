import { ApplicationError, serializeApplicationError } from "../../src/core/domain/errors";
import { LIMITS, MEBIBYTE } from "../../src/core/domain/limits";
import { isAppMessage, MESSAGE_VERSION } from "../../src/shared/messages";

describe("foundation contracts", () => {
  it("keeps documented media and archive limits in bytes", () => {
    expect(LIMITS.maxMediaBytes).toBe(25 * MEBIBYTE);
    expect(LIMITS.maxArchiveCompressedBytes).toBe(250 * MEBIBYTE);
    expect(LIMITS.maxArchiveExtractedBytes).toBe(500 * MEBIBYTE);
    expect(LIMITS.maxArchiveItems).toBe(5_000);
  });

  it("serializes expected errors without a stack trace", () => {
    const serialized = serializeApplicationError(
      new ApplicationError("ITEM_TOO_LARGE", "The image exceeds the limit.", {
        maxBytes: LIMITS.maxMediaBytes,
      }),
    );

    expect(serialized).toEqual({
      code: "ITEM_TOO_LARGE",
      message: "The image exceeds the limit.",
      details: { maxBytes: LIMITS.maxMediaBytes },
    });
    expect(serialized).not.toHaveProperty("stack");
  });

  it("recognizes only versioned message families", () => {
    expect(
      isAppMessage({
        version: MESSAGE_VERSION,
        type: "capture/status",
        correlationId: "request-1",
        payload: {},
      }),
    ).toBe(true);
    expect(isAppMessage({ version: 2, type: "capture/status" })).toBe(false);
    expect(isAppMessage({ version: MESSAGE_VERSION, type: "unknown" })).toBe(false);
  });
});
