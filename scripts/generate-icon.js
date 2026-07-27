/**
 * Generates assets/icon.ico with 16, 32, 64 and 256 px layers — no image
 * libraries required. Small layers are stored as 32bpp BMPs, the 256px
 * layer as a PNG (the Windows convention for large ICO layers).
 *
 * The artwork: a gold pediment over marble columns on a dark ground —
 * the Dev Parthenon mark.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BG = [13, 16, 23, 255]; // #0d1017
const GOLD = [217, 164, 65, 255]; // #d9a441
const MARBLE = [232, 230, 223, 255]; // #e8e6df

/** Render one square layer as an RGBA buffer. */
function drawLayer(size) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, c) => {
    const i = (y * size + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
  };

  const colCount = size >= 64 ? 6 : 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let c = BG;

      // Pediment: triangle, apex at (0.5, 0.10), base at v = 0.34.
      if (v >= 0.1 && v < 0.34) {
        const t = (v - 0.1) / 0.24; // 0 at apex row, 1 at base row
        const half = 0.02 + t * 0.4;
        if (Math.abs(u - 0.5) <= half) c = GOLD;
      }
      // Entablature beam.
      if (v >= 0.34 && v < 0.42 && u >= 0.08 && u <= 0.92) c = MARBLE;
      // Columns.
      if (v >= 0.42 && v < 0.78) {
        const span = 0.8; // columns live in u = 0.1 .. 0.9
        const rel = (u - 0.1) / span;
        if (rel >= 0 && rel <= 1) {
          const cell = rel * colCount;
          const frac = cell - Math.floor(cell);
          if (frac >= 0.18 && frac <= 0.82 && Math.floor(cell) < colCount) {
            c = MARBLE;
          }
        }
      }
      // Steps.
      if (v >= 0.78 && v < 0.86 && u >= 0.08 && u <= 0.92) c = MARBLE;
      if (v >= 0.86 && v < 0.94 && u >= 0.03 && u <= 0.97) c = GOLD;

      put(x, y, c);
    }
  }
  return px;
}

/* ---------- PNG encoding (for the 256px layer) ---------- */

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // Raw scanlines, each prefixed with filter byte 0.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- BMP encoding (for the small layers) ---------- */

function encodeIcoBmp(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // header size
  header.writeInt32LE(size, 4); // width
  header.writeInt32LE(size * 2, 8); // height (XOR + AND masks)
  header.writeUInt16LE(1, 12); // planes
  header.writeUInt16LE(32, 14); // bpp
  const andRowBytes = Math.ceil(size / 32) * 4;
  const xor = Buffer.alloc(size * size * 4);
  // BMP rows are bottom-up, pixels BGRA.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = ((size - 1 - y) * size + x) * 4;
      xor[dst] = rgba[src + 2];
      xor[dst + 1] = rgba[src + 1];
      xor[dst + 2] = rgba[src];
      xor[dst + 3] = rgba[src + 3];
    }
  }
  const and = Buffer.alloc(andRowBytes * size); // all zero = fully opaque
  header.writeUInt32LE(xor.length + and.length, 20);
  return Buffer.concat([header, xor, and]);
}

/* ---------- ICO container ---------- */

function buildIco() {
  const sizes = [16, 32, 64, 256];
  const images = sizes.map((s) => {
    const rgba = drawLayer(s);
    return { size: s, data: s === 256 ? encodePng(s, rgba) : encodeIcoBmp(s, rgba) };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size === 256 ? 0 : img.size; // 0 means 256
    e[1] = img.size === 256 ? 0 : img.size;
    e[2] = 0; // palette
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.data.length;
    entries.push(e);
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const outDir = path.join(__dirname, "..", "assets");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "icon.ico");
fs.writeFileSync(outFile, buildIco());
console.log(`wrote ${outFile} (${fs.statSync(outFile).size} bytes, layers: 16/32/64/256)`);
