export const MEBIBYTE = 1024 * 1024;

export const LIMITS = Object.freeze({
  maxMediaBytes: 25 * MEBIBYTE,
  maxArchiveCompressedBytes: 250 * MEBIBYTE,
  maxArchiveExtractedBytes: 500 * MEBIBYTE,
  maxArchiveItems: 5_000,
  defaultPageSize: 50,
  maxPageSize: 100,
  importBatchSize: 25,
});

export const DATABASE = Object.freeze({
  name: "gopaste",
  version: 2,
});

export const ARCHIVE = Object.freeze({
  format: "gopaste-archive",
  version: 1,
});
