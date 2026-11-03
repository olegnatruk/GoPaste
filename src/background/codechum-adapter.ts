import { installCodeChumWorker } from "../codechum/worker/workflow";

/** Register CodeChum's allowlisted handlers beside GoPaste's existing handlers. */
export function registerCodeChumBackground(): void {
  installCodeChumWorker();
}
