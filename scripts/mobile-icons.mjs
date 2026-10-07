// Package the original pixel bunny as launcher assets; never redraw the illustration.
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const background = [251, 228, 238];
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, bytes) {
  const data = Buffer.concat([Buffer.from(type), bytes]);
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, data, checksum]);
}

// The source is a non-interlaced 8-bit RGBA PNG. Decode all PNG row filters.
function readBunny() {
  const png = readFileSync(join(root, "mobile/app/animals/bunny.png"));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (!png.subarray(0, 8).equals(signature) || png[24] !== 8 || png[25] !== 6 || png[28] !== 0)
    throw new Error("The original bunny must be a non-interlaced 8-bit RGBA PNG.");
  const data = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
      data.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw new Error("Invalid bunny PNG data.");
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error("Unsupported PNG filter.");
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const a = x >= 4 ? pixels[index - 4] : 0;
      const b = y > 0 ? pixels[index - stride] : 0;
      const c = y > 0 && x >= 4 ? pixels[index - stride - 4] : 0;
      const p = a + b - c;
      const distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth =
        distances[0] <= distances[1] && distances[0] <= distances[2]
          ? a
          : distances[1] <= distances[2]
            ? b
            : c;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth][filter];
      pixels[index] = (raw[y * (stride + 1) + 1 + x] + prediction) & 255;
    }
  }
  return { width, height, pixels };
}
const bunny = readBunny();

export function iconPNG(size, adaptive = false) {
  if (!Number.isInteger(size) || size < 1 || size > 2048) throw new Error("Invalid icon size.");
  const channels = adaptive ? 4 : 3;
  const stride = size * channels + 1;
  const pixels = Buffer.alloc(stride * size);
  // Adaptive artwork stays inside the centered 66dp safe circle on a 108dp layer.
  const side = Math.max(1, Math.round(size * (adaptive ? 0.43 : 0.72)));
  const left = Math.floor((size - side) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = y * stride + 1 + x * channels;
      const inside = x >= left && x < left + side && y >= left && y < left + side;
      let alpha = 0;
      let source = 0;
      if (inside) {
        const sx = Math.min(bunny.width - 1, Math.floor(((x - left) * bunny.width) / side));
        const sy = Math.min(bunny.height - 1, Math.floor(((y - left) * bunny.height) / side));
        source = (sy * bunny.width + sx) * 4;
        alpha = bunny.pixels[source + 3];
      }
      for (let c = 0; c < 3; c++) {
        pixels[offset + c] = adaptive
          ? alpha
            ? bunny.pixels[source + c]
            : 0
          : Math.round((bunny.pixels[source + c] * alpha + background[c] * (255 - alpha)) / 255);
      }
      if (adaptive) pixels[offset + 3] = alpha;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = adaptive ? 6 : 2; // iOS icon is deliberately opaque.
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function generateIcons(project = root) {
  for (const [density, scale] of Object.entries({
    mdpi: 1,
    hdpi: 1.5,
    xhdpi: 2,
    xxhdpi: 3,
    xxxhdpi: 4,
  })) {
    const destination = join(project, `android/app/src/main/res/mipmap-${density}`);
    await mkdir(destination, { recursive: true });
    for (const name of ["ic_launcher", "ic_launcher_round"])
      await writeFile(join(destination, `${name}.png`), iconPNG(48 * scale));
    await writeFile(join(destination, "ic_launcher_foreground.png"), iconPNG(108 * scale, true));
  }
  await writeFile(
    join(project, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"),
    iconPNG(1024),
  );
  // Keep launch screens consistent with the installed icon.
  for (const [name, size] of [
    ["splash-2732x2732-2.png", 96],
    ["splash-2732x2732-1.png", 192],
    ["splash-2732x2732.png", 288],
  ])
    await writeFile(
      join(project, "ios/App/App/Assets.xcassets/Splash.imageset", name),
      iconPNG(size),
    );
  console.log("Original Hopper bunny icons generated on pastel pink for Android and iOS.");
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await generateIcons();
