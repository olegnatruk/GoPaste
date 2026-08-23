import { ApplicationError } from "../../core/domain/errors";
import type { CaptureStatus } from "../../shared/messages";
import { requestResult, transactionComplete } from "./request";
import { openGoPasteDatabase, STATUS_STORE } from "./schema";

const CAPTURE_STATUS_KEY = "recent-capture";

interface StoredCaptureStatus extends CaptureStatus {
  key: typeof CAPTURE_STATUS_KEY;
}

export class IndexedDbCaptureStatusStore {
  async get(): Promise<CaptureStatus> {
    try {
      const database = await openGoPasteDatabase();
      const stored = (await requestResult(
        database.transaction(STATUS_STORE).objectStore(STATUS_STORE).get(CAPTURE_STATUS_KEY),
      )) as StoredCaptureStatus | undefined;
      if (!stored) return { state: "idle", updatedAt: new Date(0).toISOString() };
      const status = { ...stored } as Partial<StoredCaptureStatus>;
      delete status.key;
      return status as CaptureStatus;
    } catch (error) {
      throw new ApplicationError(
        "STORAGE_FAILED",
        "Recent capture status could not be read.",
        undefined,
        {
          cause: error,
        },
      );
    }
  }

  async set(status: CaptureStatus): Promise<void> {
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(STATUS_STORE, "readwrite");
      await requestResult(
        transaction.objectStore(STATUS_STORE).put({ key: CAPTURE_STATUS_KEY, ...status }),
      );
      await transactionComplete(transaction);
    } catch (error) {
      throw new ApplicationError(
        "STORAGE_FAILED",
        "Recent capture status could not be saved.",
        undefined,
        { cause: error },
      );
    }
  }
}
