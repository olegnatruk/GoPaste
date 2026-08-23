import type { MediaFetchResult } from "../../core/ports/platform";
import { readBlobArrayBuffer } from "./validation";

function parseHeaders(value: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = value.replace(/\r?\n[\t ]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  return headers;
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value.trim();
  }
}

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function quotedPrintableBytes(value: string): Uint8Array {
  const unwrapped = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < unwrapped.length; index += 1) {
    if (unwrapped[index] === "=" && /^[0-9a-f]{2}$/i.test(unwrapped.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(unwrapped.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(unwrapped.charCodeAt(index) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export async function extractMediaFromMhtml(
  snapshot: Blob,
  candidateUrls: readonly string[],
): Promise<MediaFetchResult | undefined> {
  const mhtml = new TextDecoder("latin1").decode(await readBlobArrayBuffer(snapshot));
  const topSeparator = mhtml.search(/\r?\n\r?\n/);
  if (topSeparator < 0) return undefined;
  const topHeaders = parseHeaders(mhtml.slice(0, topSeparator));
  const contentType = topHeaders.get("content-type") ?? "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) return undefined;

  const wanted = new Set(candidateUrls.map(normalizeUrl));
  for (const rawPart of mhtml.split(`--${boundary}`).slice(1)) {
    if (rawPart.startsWith("--")) break;
    const part = rawPart.replace(/^\r?\n/, "");
    const separator = part.search(/\r?\n\r?\n/);
    if (separator < 0) continue;
    const separatorLength = part.slice(separator).startsWith("\r\n\r\n") ? 4 : 2;
    const headers = parseHeaders(part.slice(0, separator));
    const location = headers.get("content-location");
    if (!location || !wanted.has(normalizeUrl(location))) continue;
    const mimeType = headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (!mimeType?.startsWith("image/")) continue;

    const body = part.slice(separator + separatorLength).replace(/\r?\n$/, "");
    const encoding = headers.get("content-transfer-encoding")?.toLowerCase();
    const bytes =
      encoding === "base64"
        ? base64Bytes(body)
        : encoding === "quoted-printable"
          ? quotedPrintableBytes(body)
          : new TextEncoder().encode(body);
    return {
      blob: new Blob([Uint8Array.from(bytes).buffer], { type: mimeType }),
      declaredMimeType: mimeType,
    };
  }
  return undefined;
}
