import { inflateSync } from 'node:zlib';

import { stableCompare } from './art-source-contract.mjs';

const FORBIDDEN_PNG_CHUNKS = new Set(['iCCP', 'gAMA', 'cHRM']);
const PNG_SIGNATURE = '89504e470d0a1a0a';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePngChunks(buffer, source) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    throw new TypeError(`${source}: invalid PNG signature.`);
  }
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const typeBytes = buffer.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    const end = offset + 12 + length;
    if (end > buffer.length) throw new TypeError(`${source}: truncated PNG chunk ${type}.`);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(Buffer.concat([typeBytes, data]));
    if (actualCrc !== expectedCrc) throw new TypeError(`${source}: invalid CRC for PNG chunk ${type}.`);
    chunks.push({ type, data });
    offset = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function inspectRgbaPng(buffer, { source = 'PNG' } = {}) {
  const chunks = parsePngChunks(buffer, source);
  for (const chunk of chunks) if (FORBIDDEN_PNG_CHUNKS.has(chunk.type)) throw new TypeError(`${source}: forbidden color-profile chunk ${chunk.type}.`);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (!ihdr || ihdr.length !== 13) throw new TypeError(`${source}: missing IHDR.`);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const compression = ihdr[10];
  const filter = ihdr[11];
  const interlace = ihdr[12];
  if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
    throw new TypeError(`${source}: production PNG exports must be non-interlaced RGBA8.`);
  }
  const packed = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
  if (!packed.length) throw new TypeError(`${source}: missing IDAT.`);
  const raw = inflateSync(packed);
  const stride = width * 4;
  if (raw.length !== height * (stride + 1)) throw new TypeError(`${source}: unexpected decompressed byte length.`);
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = raw[inputOffset];
    inputOffset += 1;
    const current = Buffer.from(raw.subarray(inputOffset, inputOffset + stride));
    inputOffset += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? current[x - 4] : 0;
      const up = previous[x] ?? 0;
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      if (filterType === 1) current[x] = (current[x] + left) & 255;
      else if (filterType === 2) current[x] = (current[x] + up) & 255;
      else if (filterType === 3) current[x] = (current[x] + Math.floor((left + up) / 2)) & 255;
      else if (filterType === 4) current[x] = (current[x] + paeth(left, up, upperLeft)) & 255;
      else if (filterType !== 0) throw new TypeError(`${source}: unsupported PNG filter ${filterType}.`);
    }
    current.copy(pixels, y * stride);
    previous = current;
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const colors = new Set();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      colors.add(`#${pixels[offset].toString(16).padStart(2, '0')}${pixels[offset + 1].toString(16).padStart(2, '0')}${pixels[offset + 2].toString(16).padStart(2, '0')}`);
    }
  }
  if (maxX < 0) throw new TypeError(`${source}: export is fully transparent.`);
  return Object.freeze({
    width,
    height,
    contentBounds: Object.freeze({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }),
    colors: Object.freeze([...colors].sort(stableCompare)),
  });
}

export function inspectSvgSource(text, { source = 'SVG' } = {}) {
  const opening = String(text).match(/<svg\b[^>]*>/i)?.[0];
  if (!opening) throw new TypeError(`${source}: missing <svg> root.`);
  if (/color-profile|icc-color/i.test(text)) throw new TypeError(`${source}: embedded SVG color profiles are not allowed.`);
  const width = Number(opening.match(/\bwidth=["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i)?.[1]);
  const height = Number(opening.match(/\bheight=["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i)?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new TypeError(`${source}: explicit positive width and height are required.`);
  const colors = [...new Set((String(text).match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((value) => value.toLowerCase()))].sort(stableCompare);
  return Object.freeze({ width, height, colors: Object.freeze(colors) });
}
