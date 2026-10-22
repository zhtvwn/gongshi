/**
 * 生成客户端图标：build/icon.png、build/icon.ico、build/icon.icns
 * 纯 Node 实现（仅用内置 zlib），无需安装任何依赖，可在 GitHub Actions 上直接运行。
 *   node scripts/gen-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'build');
const BASE = 512;
const SS = 4; // 超采样倍数，用于抗锯齿

// ---------- 配色 ----------
const C_TOP = [79, 70, 229];    // #4F46E5
const C_BOTTOM = [124, 58, 237]; // #7C3AED
const C_INK = [67, 56, 202];     // #4338CA
const C_LINE = [199, 210, 254];  // #C7D2FE
const WHITE = [255, 255, 255];

// ---------- 几何 ----------
function roundedRectSDF(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  const mx = Math.max(qx, 0);
  const my = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(mx, my) - r;
}

function segmentDistance(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

function inRect(u, v, x0, y0, x1, y1) {
  return u >= x0 && u <= x1 && v >= y0 && v <= y1;
}

/** 渲染 512x512 图标（返回 RGBA） */
function renderBase() {
  const n = BASE * SS;
  const px = new Uint8ClampedArray(n * n * 4);

  for (let y = 0; y < n; y++) {
    const v = (y + 0.5) / n;
    const cv = v - 0.5;
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n;
      const cu = u - 0.5;
      const i = (y * n + x) * 4;

      // 1) 圆角渐变底板
      if (roundedRectSDF(cu, cv, 0.455, 0.455, 0.22) > 0) continue;
      const t = Math.max(0, Math.min(1, (cv + 0.455) / 0.91));
      let r = C_TOP[0] + (C_BOTTOM[0] - C_TOP[0]) * t;
      let g = C_TOP[1] + (C_BOTTOM[1] - C_TOP[1]) * t;
      let b = C_TOP[2] + (C_BOTTOM[2] - C_TOP[2]) * t;
      let a = 255;

      // 2) 白色书页
      const book = roundedRectSDF(cu, cv - 0.005, 0.245, 0.275, 0.045);
      if (book <= 0) {
        r = WHITE[0]; g = WHITE[1]; b = WHITE[2];

        // 3) 书脊
        if (inRect(u, v, 0.457, 0.225, 0.487, 0.775)) {
          r = C_INK[0]; g = C_INK[1]; b = C_INK[2];
        }

        // 4) 右页 Σ
        const cx = 0.615, cy = 0.5, hw = 0.085, hh = 0.105, th = 0.012;
        const sigma =
          segmentDistance(u, v, cx - hw, cy - hh, cx + hw, cy - hh) <= th ||
          segmentDistance(u, v, cx + hw, cy - hh, cx - hw, cy) <= th ||
          segmentDistance(u, v, cx - hw, cy, cx + hw, cy + hh) <= th ||
          segmentDistance(u, v, cx + hw, cy + hh, cx - hw, cy + hh) <= th;
        if (sigma) {
          r = C_INK[0]; g = C_INK[1]; b = C_INK[2];
        }

        // 5) 左页文字线
        const lines =
          (inRect(u, v, 0.30, 0.385, 0.425, 0.407) ||
            inRect(u, v, 0.30, 0.485, 0.425, 0.507) ||
            inRect(u, v, 0.30, 0.585, 0.385, 0.607));
        if (lines && !sigma) {
          r = C_LINE[0]; g = C_LINE[1]; b = C_LINE[2];
        }
      }

      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    }
  }

  // 降采样抗锯齿
  const out = new Uint8ClampedArray(BASE * BASE * 4);
  const step = SS * SS;
  for (let y = 0; y < BASE; y++) {
    for (let x = 0; x < BASE; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * n + (x * SS + sx)) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
        }
      }
      const o = (y * BASE + x) * 4;
      out[o] = r / step; out[o + 1] = g / step; out[o + 2] = b / step; out[o + 3] = a / step;
    }
  }
  return out;
}

/** 区域平均缩放 */
function resize(src, srcSize, dstSize) {
  const out = new Uint8ClampedArray(dstSize * dstSize * 4);
  const scale = srcSize / dstSize;
  for (let y = 0; y < dstSize; y++) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.min(srcSize, Math.max(y0 + 1, Math.ceil((y + 1) * scale)));
    for (let x = 0; x < dstSize; x++) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.min(srcSize, Math.max(x0 + 1, Math.ceil((x + 1) * scale)));
      let r = 0, g = 0, b = 0, a = 0, cnt = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * srcSize + xx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; cnt++;
        }
      }
      const o = (y * dstSize + x) * 4;
      out[o] = r / cnt; out[o + 1] = g / cnt; out[o + 2] = b / cnt; out[o + 3] = a / cnt;
    }
  }
  return out;
}

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4).copy(raw, y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- ICO / ICNS ----------
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dirSize = 16 * entries.length;
  let offset = 6 + dirSize;
  const dirs = [];
  for (const { size, png } of entries) {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size;
    d[1] = size >= 256 ? 0 : size;
    d[2] = 0; d[3] = 0;
    d.writeUInt16LE(1, 4);   // planes
    d.writeUInt16LE(32, 6);  // bpp
    d.writeUInt32LE(png.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += png.length;
    dirs.push(d);
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
}

function encodeIcns(entries) {
  const blocks = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([head, png]);
  });
  const total = 8 + blocks.reduce((s, b) => s + b.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(total, 4);
  return Buffer.concat([header, ...blocks]);
}

// ---------- 主流程 ----------
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = renderBase();

  const png512 = encodePng(BASE, base);
  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png512);

  const icoSizes = [256, 128, 64, 48, 32, 16];
  const ico = encodeIco(icoSizes.map((size) => ({ size, png: encodePng(size, resize(base, BASE, size)) })));
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico);

  const icnsTypes = [
    { type: 'ic09', size: 512 },
    { type: 'ic08', size: 256 },
    { type: 'ic07', size: 128 },
    { type: 'ic12', size: 64 },
    { type: 'ic11', size: 32 }
  ];
  const icns = encodeIcns(icnsTypes.map(({ type, size }) => ({ type, png: encodePng(size, resize(base, BASE, size)) })));
  fs.writeFileSync(path.join(OUT_DIR, 'icon.icns'), icns);

  console.log('图标已生成于 client/build/: icon.png(512) icon.ico icon.icns');
}

main();
