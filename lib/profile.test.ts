import { describe, expect, it } from "vitest";
import { cleanName, isDeletePhrase, isOwnAvatar, NAME_LENGTH, parseDataKinds, sniffImage } from "./profile";

describe("cleanName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanName("  Ada   Lovelace \n")).toBe("Ada Lovelace");
  });
  it("accepts names in any script, up to the limit in characters", () => {
    expect(cleanName("Zoë 王")).toBe("Zoë 王");
    expect(cleanName("😀".repeat(NAME_LENGTH))).toBe("😀".repeat(NAME_LENGTH));
    expect(cleanName("a".repeat(NAME_LENGTH + 1))).toBeNull();
  });
  it("refuses empty names, control and invisible characters, and non-strings", () => {
    for (const bad of ["", "   ", "a\u0000b", "a​b", "a‮b", 5, null, undefined, ["a"]]) expect(cleanName(bad)).toBeNull();
  });
});

describe("sniffImage", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it("knows WebP, JPEG and PNG by their first bytes", () => {
    expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  });
  it("refuses anything else, including SVG, HTML, a RIFF that isn't WebP, and truncated files", () => {
    const text = (s: string) => new TextEncoder().encode(s);
    expect(sniffImage(text("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImage(text("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull(); // WAVE
    expect(sniffImage(bytes(0x89, 0x50, 0x4e))).toBeNull();
    expect(sniffImage(bytes())).toBeNull();
  });
});

describe("isOwnAvatar", () => {
  it("is true only for this site's own picture address", () => {
    expect(isOwnAvatar("/api/account/avatar?v=0123456789abcdef")).toBe(true);
    for (const other of ["https://lh3.googleusercontent.com/a/photo", "//evil.example/x.png", "/api/account/avatar?v=x&y=1", "/api/account/avatar", "javascript:alert(1)", null, undefined, ""]) {
      expect(isOwnAvatar(other)).toBe(false);
    }
  });
});

describe("parseDataKinds", () => {
  it("accepts a list of known kinds, without repeats", () => {
    expect(parseDataKinds(["portfolio", "lessons", "portfolio"])).toEqual(["portfolio", "lessons"]);
  });
  it("refuses empty, unknown or malformed choices", () => {
    for (const bad of [[], ["everything"], "portfolio", [1], null, Array(20).fill("portfolio")]) expect(parseDataKinds(bad)).toBeNull();
  });
});

describe("isDeletePhrase", () => {
  it("needs the exact words, in any case", () => {
    expect(isDeletePhrase("delete my account")).toBe(true);
    expect(isDeletePhrase(" Delete My Account ")).toBe(true);
    expect(isDeletePhrase("delete")).toBe(false);
    expect(isDeletePhrase(undefined)).toBe(false);
  });
});
