import { extractMediaFromMhtml } from "../../src/infrastructure/media/mhtml-media";

describe("extractMediaFromMhtml", () => {
  it("extracts the exact selected cross-origin image resource", async () => {
    const mhtml = [
      "MIME-Version: 1.0",
      'Content-Type: multipart/related; boundary="gopaste-boundary"',
      "",
      "--gopaste-boundary",
      "Content-Type: text/html",
      "Content-Location: https://page.test/",
      "",
      "<html></html>",
      "--gopaste-boundary",
      "Content-Type: image/gif",
      "Content-Transfer-Encoding: base64",
      "Content-Location: https://cdn.test/chosen.gif",
      "",
      "R0lGODlh",
      "--gopaste-boundary--",
      "",
    ].join("\r\n");
    const result = await extractMediaFromMhtml(new Blob([mhtml]), ["https://cdn.test/chosen.gif"]);
    expect(result?.declaredMimeType).toBe("image/gif");
    expect(result?.blob.size).toBe(6);
  });

  it("does not return a different image from the snapshot", async () => {
    const mhtml = [
      'Content-Type: multipart/related; boundary="b"',
      "",
      "--b",
      "Content-Type: image/png",
      "Content-Transfer-Encoding: base64",
      "Content-Location: https://cdn.test/other.png",
      "",
      "iVBORw0KGgo=",
      "--b--",
    ].join("\r\n");
    await expect(
      extractMediaFromMhtml(new Blob([mhtml]), ["https://cdn.test/chosen.gif"]),
    ).resolves.toBeUndefined();
  });
});
