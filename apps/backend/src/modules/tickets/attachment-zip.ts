import { crc32, inflateRawSync } from 'node:zlib';

const allowedFlags = 0x000e | 0x0800;
const maxExpanded = 64 * 1024 * 1024;
const maxEntry = 16 * 1024 * 1024;
function requireZip(condition: unknown): asserts condition {
  if (!condition) throw new Error('ZIP inválido ou incompatível.');
}
function validateExtra(bytes: Buffer) {
  for (let i = 0; i < bytes.length;) {
    requireZip(i + 4 <= bytes.length);
    const tag = bytes.readUInt16LE(i);
    // Timestamps and Office's local padding have no effect on member paths.
    requireZip([0x000a, 0x5455, 0xa220].includes(tag));
    i += 4 + bytes.readUInt16LE(i + 2);
    requireZip(i <= bytes.length);
  }
}

type Member = {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
};

function endOfDirectory(file: Buffer) {
  const last = file.length - 22;
  const first = Math.max(0, last - 0xffff);
  let end: number | undefined;
  for (let offset = last; offset >= first; offset--) {
    if (
      file.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + file.readUInt16LE(offset + 20) === file.length &&
      file.readUInt32LE(offset + 12) + file.readUInt32LE(offset + 16) === offset
    ) {
      requireZip(end === undefined);
      end = offset;
    }
  }
  requireZip(end !== undefined);
  return end;
}

/** Reads a bounded, single-volume ZIP without writing any member to disk. */
export function readOfficeZip(file: Buffer) {
  const end = endOfDirectory(file);
  requireZip(file.readUInt32LE(end + 4) === 0);
  const count = file.readUInt16LE(end + 10);
  const central = file.readUInt32LE(end + 16);
  requireZip(
    count > 0 && count <= 1024 && count === file.readUInt16LE(end + 8),
  );
  const members: Member[] = [];
  const names = new Set<string>();
  let cursor = central;
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    requireZip(cursor + 46 <= end && file.readUInt32LE(cursor) === 0x02014b50);
    const nameSize = file.readUInt16LE(cursor + 28);
    const extra = cursor + 46 + nameSize;
    const extraEnd = extra + file.readUInt16LE(cursor + 30);
    const next = extraEnd + file.readUInt16LE(cursor + 32);
    requireZip(
      nameSize > 0 &&
        nameSize <= 240 &&
        next <= end &&
        file.readUInt16LE(cursor + 34) === 0,
    );
    const name = file.toString('latin1', cursor + 46, cursor + 46 + nameSize);
    const mode = file.readUInt32LE(cursor + 38);
    requireZip(
      [0, 0x4000, 0x8000].includes((mode >>> 16) & 0xf000) &&
        (mode & 0x400) === 0,
    );
    validateExtra(file.subarray(extra, extraEnd));
    const parts = name.replace(/\/$/, '').split('/');
    requireZip(
      parts.every(
        (part) => /^[\w.[\] -]+$/.test(part) && part !== '.' && part !== '..',
      ),
    );
    requireZip(!names.has(name.toLowerCase()));
    names.add(name.toLowerCase());
    const flags = file.readUInt16LE(cursor + 8);
    const method = file.readUInt16LE(cursor + 10);
    const size = file.readUInt32LE(cursor + 24);
    expanded += size;
    requireZip((flags & ~allowedFlags) === 0 && (method === 0 || method === 8));
    requireZip(
      size <= maxEntry &&
        expanded <= maxExpanded &&
        (!name.endsWith('/') || size === 0),
    );
    members.push({
      name,
      flags,
      method,
      size,
      crc: file.readUInt32LE(cursor + 16),
      compressed: file.readUInt32LE(cursor + 20),
      offset: file.readUInt32LE(cursor + 42),
    });
    cursor = next;
  }
  requireZip(cursor === end);
  const entries = new Map<string, Buffer>();
  cursor = 0;
  for (const member of members.sort((a, b) => a.offset - b.offset)) {
    const { name, flags, method, size, crc, compressed, offset } = member;
    requireZip(
      offset === cursor &&
        offset + 30 <= central &&
        file.readUInt32LE(offset) === 0x04034b50,
    );
    requireZip(
      file.readUInt16LE(offset + 6) === flags &&
        file.readUInt16LE(offset + 8) === method,
    );
    const nameSize = file.readUInt16LE(offset + 26);
    const data = offset + 30 + nameSize + file.readUInt16LE(offset + 28);
    cursor = data + compressed;
    requireZip(
      cursor <= central &&
        file.toString('latin1', offset + 30, offset + 30 + nameSize) === name,
    );
    validateExtra(file.subarray(offset + 30 + nameSize, data));
    const local = [
      file.readUInt32LE(offset + 14),
      file.readUInt32LE(offset + 18),
      file.readUInt32LE(offset + 22),
    ];
    const expected = [crc, compressed, size];
    requireZip(
      local.every((value, index) => value === expected[index]) ||
        ((flags & 8) !== 0 && local.every((value) => value === 0)),
    );
    if (flags & 8) {
      requireZip(cursor + 12 <= central);
      if (file.readUInt32LE(cursor) === 0x08074b50) cursor += 4;
      requireZip(
        cursor + 12 <= central &&
          expected.every(
            (value, index) => value === file.readUInt32LE(cursor + 4 * index),
          ),
      );
      cursor += 12;
    }
    const raw = file.subarray(data, data + compressed);
    const decoded = method === 0 ? raw : inflateMember(raw, size);
    requireZip(decoded.length === size && crc32(decoded) === crc);
    if (!name.endsWith('/')) entries.set(name, decoded);
  }
  requireZip(cursor === central);
  return entries;
}

function inflateMember(raw: Buffer, size: number) {
  // Node returns the engine with info:true. Verify the entire member was consumed.
  const result = inflateRawSync(raw, {
    maxOutputLength: size + 1,
    info: true,
  }) as unknown as {
    buffer: Buffer;
    engine: { bytesWritten: number };
  };
  requireZip(result.engine.bytesWritten === raw.length);
  return result.buffer;
}
