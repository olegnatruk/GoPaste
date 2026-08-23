import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { MediaRepository } from "../../src/core/ports/media-repository";
import { OptionsShell } from "../../src/options/OptionsShell";

function repository(overrides: Partial<MediaRepository> = {}): MediaRepository {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    findByHash: vi.fn(),
    list: vi.fn(),
    updateMetadata: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn().mockResolvedValue({ itemCount: 12, totalBytes: 2048 }),
    bulkCreate: vi.fn(),
    ...overrides,
  } as MediaRepository;
}

describe("OptionsShell", () => {
  it("shows storage statistics and exports a backup", async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    const exportArchive = vi.fn().mockResolvedValue(new Blob(["zip"]));
    render(
      <OptionsShell
        repository={repository()}
        download={download}
        createArchiveService={() => ({ exportArchive, importArchive: vi.fn() })}
      />,
    );

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("2.00 KiB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export backup" }));
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.zip$/)),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Backup created");
  });

  it("disables concurrent controls and announces import progress and failures", async () => {
    let finishImport:
      | ((value: {
          imported: number;
          duplicates: number;
          failed: number;
          failures: never[];
        }) => void)
      | undefined;
    const importArchive = vi.fn((file: Blob) => {
      void file;
      return new Promise<{
        imported: number;
        duplicates: number;
        failed: number;
        failures: never[];
      }>((resolve) => {
        finishImport = resolve;
      });
    });
    render(
      <OptionsShell
        repository={repository()}
        createArchiveService={(_repository, progress) => ({
          exportArchive: vi.fn(),
          importArchive: (file) => {
            progress({ phase: "importing", completed: 1, total: 2 });
            return importArchive(file);
          },
        })}
      />,
    );
    await screen.findByText("12");
    const input = screen.getByLabelText("Import backup") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["zip"], "backup.zip")] } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Export backup" })).toBeDisabled(),
    );
    expect(input).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Importing 1 of 2");
    finishImport?.({ imported: 1, duplicates: 1, failed: 0, failures: [] });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("1 imported, 1 duplicate, 0 failed"),
    );
    expect(screen.getByRole("button", { name: "Export backup" })).toBeEnabled();
  });

  it("shows a retry when storage statistics fail", async () => {
    const getStats = vi
      .fn()
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockResolvedValue({
        itemCount: 2,
        totalBytes: 6,
      });
    render(<OptionsShell repository={repository({ getStats })} />);
    expect(await screen.findByText("Storage unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry statistics" }));
    expect(await screen.findByText("2")).toBeInTheDocument();
  });
});
