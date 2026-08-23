import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import JSZip from "jszip";

const projectRoot = process.cwd();
const distributionDirectory = join(projectRoot, "dist");
const outputFile = join(projectRoot, "gopaste-extension.zip");

async function addDirectory(zip, directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await addDirectory(zip, absolutePath);
      continue;
    }

    if (entry.isFile()) {
      const archivePath = relative(distributionDirectory, absolutePath).replaceAll("\\", "/");
      zip.file(archivePath, await readFile(absolutePath));
    }
  }
}

const zip = new JSZip();
await addDirectory(zip, distributionDirectory);

const archive = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
});

await writeFile(outputFile, archive);
console.log(`Created ${relative(projectRoot, outputFile)}`);
