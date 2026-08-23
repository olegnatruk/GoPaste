import type { SerializedApplicationError } from "../core/domain/errors";
import type { StorageStats } from "../core/domain/media";

export const MESSAGE_VERSION = 1 as const;

export type CaptureState = "idle" | "saving" | "saved" | "duplicate" | "failed";

export interface CaptureStatus {
  state: CaptureState;
  updatedAt: string;
  itemId?: string;
  error?: SerializedApplicationError;
}

interface RequestEnvelope<Type extends string, Payload> {
  version: typeof MESSAGE_VERSION;
  type: Type;
  correlationId: string;
  payload: Payload;
}

export type AppRequest =
  | RequestEnvelope<"capture/status", Record<string, never>>
  | RequestEnvelope<"storage/stats", Record<string, never>>;

export type AppRequestResult<T extends AppRequest["type"]> = T extends "capture/status"
  ? CaptureStatus
  : T extends "storage/stats"
    ? StorageStats
    : never;

export type AppResponse<Result = unknown> =
  | {
      version: typeof MESSAGE_VERSION;
      correlationId: string;
      ok: true;
      result: Result;
    }
  | {
      version: typeof MESSAGE_VERSION;
      correlationId: string;
      ok: false;
      error: SerializedApplicationError;
    };

export interface LibraryChangedEvent {
  version: typeof MESSAGE_VERSION;
  type: "library/changed";
  payload: {
    reason: "created" | "updated" | "deleted" | "imported";
    itemIds?: string[];
  };
}

export type AppMessage = AppRequest | LibraryChangedEvent;

export function isAppMessage(value: unknown): value is AppMessage {
  if (!value || typeof value !== "object") return false;

  const candidate = value as { version?: unknown; type?: unknown };
  return (
    candidate.version === MESSAGE_VERSION &&
    (candidate.type === "capture/status" ||
      candidate.type === "storage/stats" ||
      candidate.type === "library/changed")
  );
}
