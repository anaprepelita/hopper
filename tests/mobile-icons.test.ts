import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { iconPNG } from "../scripts/mobile-icons.mjs";

function pixels(png: Buffer) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const channels = png[25] === 6 ? 4 : 3;
  const chunks: Buffer[] = [];
  for (let pos = 8; pos < png.length;) {
    const length = png.readUInt32BE(pos);
    if (png.toString("ascii", pos + 4, pos + 8) === "IDAT")
      chunks.push(png.subarray(pos + 8, pos + 8 + length));
    pos += length + 12;
  }
  const rows = inflateSync(Buffer.concat(chunks));
  const at = (x: number, y: number) => [
    ...rows.subarray(
      y * (width * channels + 1) + 1 + x * channels,
      y * (width * channels + 1) + 1 + (x + 1) * channels,
    ),
  ];
  return { width, height, channels, at };
}
describe("Original bunny launcher assets", () => {
  it("preserves the original animal asset and produces an opaque pastel iOS icon", () => {
    const original = readFileSync("mobile/app/animals/bunny.png");
    expect(createHash("sha256").update(original).digest("hex")).toBe(
      "d45e6bfcf0aec057fdde61e9d5138568e6d7d9dcea3abd466f35247029c2531f",
    );
    const icon = readFileSync("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
    expect(icon.equals(iconPNG(1024))).toBe(true);
    const decoded = pixels(icon);
    expect([decoded.width, decoded.height, decoded.channels]).toEqual([1024, 1024, 3]);
    expect(decoded.at(0, 0)).toEqual([251, 228, 238]);
    expect(decoded.at(512, 512)).not.toEqual([251, 228, 238]);
  });
  it.each([
    ["mdpi", 1],
    ["hdpi", 1.5],
    ["xhdpi", 2],
    ["xxhdpi", 3],
    ["xxxhdpi", 4],
  ] as const)("keeps Android %s artwork within every launcher mask", (density, scale) => {
    const folder = `android/app/src/main/res/mipmap-${density}`;
    const legacy = pixels(readFileSync(`${folder}/ic_launcher.png`));
    expect([legacy.width, legacy.height, legacy.channels]).toEqual([48 * scale, 48 * scale, 3]);
    expect(legacy.at(0, 0)).toEqual([251, 228, 238]);
    const foreground = pixels(readFileSync(`${folder}/ic_launcher_foreground.png`));
    expect([foreground.width, foreground.height, foreground.channels]).toEqual([
      108 * scale,
      108 * scale,
      4,
    ]);
    expect(foreground.at(0, 0)[3]).toBe(0);
    let visible = 0;
    for (let y = 0; y < foreground.height; y++)
      for (let x = 0; x < foreground.width; x++) {
        if (!foreground.at(x, y)[3]) continue;
        visible++;
        expect(
          Math.hypot(x + 0.5 - foreground.width / 2, y + 0.5 - foreground.height / 2),
        ).toBeLessThanOrEqual(33 * scale);
      }
    expect(visible).toBeGreaterThan(0);
  });
});
