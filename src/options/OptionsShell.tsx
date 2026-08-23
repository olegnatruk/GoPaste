import { useCallback, useEffect, useMemo, useState } from "react";

import type { ArchiveImportSummary } from "../core/domain/archive";
import type { StorageStats } from "../core/domain/media";
import type { MediaRepository } from "../core/ports/media-repository";
import {
  ZipArchiveService,
  downloadArchive,
  type ArchiveProgress,
} from "../infrastructure/archive";
import { IndexedDbMediaRepository } from "../infrastructure/indexeddb/media-repository";
import { BrandMark } from "../shared/BrandMark";

export interface OptionsShellProps {
  repository?: MediaRepository;
  download?: (blob: Blob, filename: string) => Promise<void>;
  createArchiveService?: (
    repository: MediaRepository,
    onProgress: (progress: ArchiveProgress) => void,
  ) => Pick<ZipArchiveService, "exportArchive" | "importArchive">;
}

type Operation = "export" | "import";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function filenameForNow(): string {
  return `gopaste-backup-${new Date().toISOString().slice(0, 10)}.zip`;
}

export function OptionsShell({
  repository: repositoryProp,
  download = downloadArchive,
  createArchiveService = (repository, onProgress) =>
    new ZipArchiveService(repository, { onProgress }),
}: OptionsShellProps) {
  const repository = useMemo(
    () => repositoryProp ?? new IndexedDbMediaRepository(),
    [repositoryProp],
  );
  const [stats, setStats] = useState<StorageStats>();
  const [statsError, setStatsError] = useState<string>();
  const [operation, setOperation] = useState<Operation>();
  const [progress, setProgress] = useState<ArchiveProgress>();
  const [result, setResult] = useState<ArchiveImportSummary>();
  const [message, setMessage] = useState("Loading storage statistics…");

  const loadStats = useCallback(
    async (announce = true) => {
      try {
        const next = await repository.getStats();
        setStats(next);
        setStatsError(undefined);
        if (announce) setMessage("Storage statistics loaded.");
      } catch (error) {
        setStatsError(
          error instanceof Error ? error.message : "Storage statistics are unavailable.",
        );
        if (announce) setMessage("Storage statistics could not be loaded.");
      }
    },
    [repository],
  );

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const createService = () => createArchiveService(repository, setProgress);

  const handleExport = async () => {
    setOperation("export");
    setProgress(undefined);
    setResult(undefined);
    setMessage("Creating backup…");
    try {
      const blob = await createService().exportArchive();
      await download(blob, filenameForNow());
      setMessage("Backup created. Choose where to save the ZIP file.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The backup could not be created.");
    } finally {
      setOperation(undefined);
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    setOperation("import");
    setProgress(undefined);
    setResult(undefined);
    setMessage("Checking and importing backup…");
    try {
      const summary = await createService().importArchive(file);
      setResult(summary);
      setProgress(undefined);
      setMessage(
        `Import finished: ${summary.imported} imported, ${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"}, ${summary.failed} failed.`,
      );
      await loadStats(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The backup could not be imported.");
    } finally {
      setOperation(undefined);
    }
  };

  const busy = operation !== undefined;
  const progressText = progress
    ? `${progress.phase === "exporting" ? "Exporting" : "Importing"} ${progress.completed} of ${progress.total}`
    : undefined;

  return (
    <main className="surface surface--options">
      <header className="surface__header options-header">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <h1>GoPaste</h1>
            <p>Library settings</p>
          </div>
        </div>
        <div className="options-header__intro">
          <h2>Keep your collection portable.</h2>
          <p>Review local storage, create a backup, or restore a collection.</p>
        </div>
      </header>
      <div className="options-layout">
        <section className="storage-panel" aria-labelledby="storage-heading">
          <div className="section-heading">
            <h2 id="storage-heading">On this device</h2>
            <p>Your collection stays in this Chrome profile.</p>
          </div>
          {stats ? (
            <dl className="stats-grid">
              <div>
                <dt>Saved items</dt>
                <dd>{stats.itemCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Media size</dt>
                <dd>{formatBytes(stats.totalBytes)}</dd>
              </div>
            </dl>
          ) : (
            <p>{statsError ?? "Calculating…"}</p>
          )}
          {statsError ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void loadStats()}
            >
              Retry statistics
            </button>
          ) : null}
        </section>

        <section className="backup-panel" aria-labelledby="backup-heading">
          <div className="section-heading">
            <h2 id="backup-heading">Backup &amp; restore</h2>
            <p>Move your library with one private, portable ZIP file.</p>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void handleExport()}
            >
              {operation === "export" ? "Creating backup…" : "Export backup"}
            </button>
            <label className={`button button--secondary${busy ? " button--disabled" : ""}`}>
              {operation === "import" ? "Importing…" : "Import backup"}
              <input
                className="visually-hidden"
                type="file"
                accept=".zip,application/zip"
                disabled={busy}
                onChange={(event) => {
                  const input = event.currentTarget;
                  void handleImport(input.files?.[0]).finally(() => {
                    input.value = "";
                  });
                }}
              />
            </label>
          </div>
          {progressText ? (
            <div className="progress-row">
              <progress
                aria-label={progressText}
                value={progress?.completed}
                max={progress?.total}
              />
              <span>{progressText}</span>
            </div>
          ) : null}
          <p className="settings-status" role="status" aria-live="polite">
            {progressText ?? message}
          </p>
          {result && result.failures.length > 0 ? (
            <details>
              <summary>
                Review {result.failures.length} import failure
                {result.failures.length === 1 ? "" : "s"}
              </summary>
              <ul className="failure-list">
                {result.failures.map((failure, index) => (
                  <li key={`${failure.file ?? "metadata"}-${failure.code}-${index}`}>
                    <strong>{failure.file ?? "metadata item"}:</strong> {failure.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>
    </main>
  );
}
