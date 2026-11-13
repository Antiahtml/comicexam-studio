import { describe, expect, it } from "vitest";
import { hasImageExtension, isIgnorableEntry, isSafeEntryName } from "@/lib/archive/safe-path";
import { detectArchive, detectImage } from "@/lib/archive/detect";
import { dataPath } from "@/lib/storage";

describe("seguridad de rutas (Zip Slip / path traversal)", () => {
  it.each(["../evil.jpg", "a/../../evil.jpg", "/etc/passwd", "C:\\Windows\\evil.jpg", "a\\..\\..\\b.jpg", "bad\0name.jpg", ""])("rechaza %j", (name) => {
    expect(isSafeEntryName(name)).toBe(false);
  });

  it.each(["pagina 1.jpg", "Cap 1/p01.png", "a..b/c.jpg", "ñandú/página 2.webp"])("acepta %j", (name) => {
    expect(isSafeEntryName(name)).toBe(true);
  });

  it("ignora metadatos y archivos ocultos", () => {
    expect(isIgnorableEntry("__MACOSX/x/._p1.jpg")).toBe(true);
    expect(isIgnorableEntry("dir/.DS_Store")).toBe(true);
    expect(isIgnorableEntry("Thumbs.db")).toBe(true);
    expect(isIgnorableEntry("dir/p1.jpg")).toBe(false);
  });

  it("filtra por extensión de imagen", () => {
    expect(hasImageExtension("a.JPG")).toBe(true);
    expect(hasImageExtension("ComicInfo.xml")).toBe(false);
  });

  it("no permite salir del directorio de datos", () => {
    expect(() => dataPath("../fuera")).toThrow();
    expect(() => dataPath("comics/../../fuera")).toThrow();
    expect(dataPath("comics/abc")).toContain("comics");
  });
});

describe("detección del tipo real de archivo", () => {
  it("reconoce RAR4, RAR5 y ZIP por su firma", () => {
    expect(detectArchive(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]))).toBe("rar");
    expect(detectArchive(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]))).toBe("rar");
    expect(detectArchive(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe("zip");
    expect(detectArchive(Buffer.from("%PDF-1.4"))).toBeNull();
  });

  it("reconoce JPEG, PNG y WebP", () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(detectImage(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1"))).toBe("webp");
    expect(detectImage(Buffer.from("<svg>"))).toBeNull();
  });
});
