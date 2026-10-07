import { createReadStream } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import type { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";
import {
  defineArchiveFormat,
  type ArchiveIndexResult,
  type ArchiveMember,
  type MemberBytes,
} from "@plugins/infra/plugins/host-fs/server";
import { decodeZipName } from "./names";

// Record signatures (APPNOTE.TXT §4.3).
const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

const EOCD_SIZE = 22;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_EOCD_SIZE = 56;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
/** The end record sits in the last 22 bytes plus at most a 64 KiB comment. */
const MAX_EOCD_SEARCH = EOCD_SIZE + 0xffff;

const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
/** "Version made by" high byte: the attributes are Unix mode bits. */
const HOST_UNIX = 3;
const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

const EXTRA_ZIP64 = 0x0001;
const EXTRA_EXT_TIMESTAMP = 0x5455;
const EXTRA_UNICODE_PATH = 0x7075;

const corrupt = { kind: "unreadable", reason: "corrupt" } as const;

async function readAt(
  fh: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/** Where a member's compressed bytes are, and how to decode them. */
interface ZipLocator {
  flags: number;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

/** The central directory's position and entry count, from the (zip64) end record. */
async function readDirectoryBounds(
  fh: FileHandle,
  fileSize: number,
): Promise<{ count: number; offset: number; size: number } | null> {
  const tailLength = Math.min(fileSize, MAX_EOCD_SEARCH);
  const tailStart = fileSize - tailLength;
  const tail = await readAt(fh, tailStart, tailLength);
  let eocd = -1;
  for (let i = tail.length - EOCD_SIZE; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return null;
  let count = tail.readUInt16LE(eocd + 10);
  let size = tail.readUInt32LE(eocd + 12);
  let offset = tail.readUInt32LE(eocd + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locator = eocd - ZIP64_LOCATOR_SIZE;
    if (locator < 0 || tail.readUInt32LE(locator) !== ZIP64_LOCATOR_SIG)
      return null;
    const recordOffset = Number(tail.readBigUInt64LE(locator + 8));
    const record = await readAt(fh, recordOffset, ZIP64_EOCD_SIZE);
    if (
      record.length < ZIP64_EOCD_SIZE ||
      record.readUInt32LE(0) !== ZIP64_EOCD_SIG
    )
      return null;
    count = Number(record.readBigUInt64LE(32));
    size = Number(record.readBigUInt64LE(40));
    offset = Number(record.readBigUInt64LE(48));
  }
  if (offset + size > fileSize) return null;
  return { count, offset, size };
}

/** A DOS date and time (local time, two-second resolution) as epoch ms. */
function dosTimeMs(date: number, time: number): number {
  return new Date(
    ((date >> 9) & 0x7f) + 1980,
    ((date >> 5) & 0x0f) - 1,
    date & 0x1f,
    (time >> 11) & 0x1f,
    (time >> 5) & 0x3f,
    (time & 0x1f) * 2,
  ).getTime();
}

interface Extras {
  size?: number;
  compressedSize?: number;
  localHeaderOffset?: number;
  mtimeMs?: number;
  unicodePath?: { nameCrc: number; name: string };
}

/**
 * Read the extra fields a member's central record carries. The zip64 field
 * holds, in order, only the values whose 32-bit slot is saturated.
 */
function readExtras(
  extra: Buffer,
  saturated: {
    size: boolean;
    compressedSize: boolean;
    localHeaderOffset: boolean;
  },
): Extras {
  const out: Extras = {};
  let pos = 0;
  while (pos + 4 <= extra.length) {
    const id = extra.readUInt16LE(pos);
    const len = extra.readUInt16LE(pos + 2);
    const data = extra.subarray(pos + 4, pos + 4 + len);
    pos += 4 + len;
    if (data.length < len) break;
    if (id === EXTRA_ZIP64) {
      let at = 0;
      const next = (): number | undefined => {
        if (at + 8 > data.length) return undefined;
        const value = Number(data.readBigUInt64LE(at));
        at += 8;
        return value;
      };
      if (saturated.size) out.size = next();
      if (saturated.compressedSize) out.compressedSize = next();
      if (saturated.localHeaderOffset) out.localHeaderOffset = next();
    } else if (
      id === EXTRA_EXT_TIMESTAMP &&
      data.length >= 5 &&
      (data[0]! & 1) === 1
    ) {
      out.mtimeMs = data.readUInt32LE(1) * 1000;
    } else if (id === EXTRA_UNICODE_PATH && data.length >= 5 && data[0] === 1) {
      out.unicodePath = {
        nameCrc: data.readUInt32LE(1),
        name: new TextDecoder().decode(data.subarray(5)),
      };
    }
  }
  return out;
}

/**
 * Read the zip's central directory into members. Nothing is decompressed:
 * listing a zip of any size reads its end record and its table of contents.
 */
export async function indexZip(
  file: string,
  opts: { maxMembers: number },
): Promise<ArchiveIndexResult> {
  const fh = await open(file, "r");
  try {
    const fileSize = (await fh.stat()).size;
    const bounds = await readDirectoryBounds(fh, fileSize);
    if (bounds === null) return corrupt;
    if (bounds.count > opts.maxMembers)
      return { kind: "unreadable", reason: "too-many-entries" };
    const dir = await readAt(fh, bounds.offset, bounds.size);
    if (dir.length < bounds.size) return corrupt;
    const members: ArchiveMember[] = [];
    let pos = 0;
    for (let i = 0; i < bounds.count; i++) {
      if (
        pos + CENTRAL_SIZE > dir.length ||
        dir.readUInt32LE(pos) !== CENTRAL_SIG
      )
        return corrupt;
      const madeBy = dir.readUInt16LE(pos + 4);
      const flags = dir.readUInt16LE(pos + 8);
      const method = dir.readUInt16LE(pos + 10);
      const time = dir.readUInt16LE(pos + 12);
      const date = dir.readUInt16LE(pos + 14);
      const compressedSize32 = dir.readUInt32LE(pos + 20);
      const size32 = dir.readUInt32LE(pos + 24);
      const nameLength = dir.readUInt16LE(pos + 28);
      const extraLength = dir.readUInt16LE(pos + 30);
      const commentLength = dir.readUInt16LE(pos + 32);
      const externalAttrs = dir.readUInt32LE(pos + 38);
      const localOffset32 = dir.readUInt32LE(pos + 42);
      const nameStart = pos + CENTRAL_SIZE;
      const extraStart = nameStart + nameLength;
      const next = extraStart + extraLength + commentLength;
      if (next > dir.length) return corrupt;
      const nameBytes = dir.subarray(nameStart, extraStart);
      const extras = readExtras(
        dir.subarray(extraStart, extraStart + extraLength),
        {
          size: size32 === 0xffffffff,
          compressedSize: compressedSize32 === 0xffffffff,
          localHeaderOffset: localOffset32 === 0xffffffff,
        },
      );
      pos = next;

      const path = decodeZipName(
        nameBytes,
        (flags & FLAG_UTF8) !== 0,
        extras.unicodePath,
      );
      const mtimeMs = extras.mtimeMs ?? dosTimeMs(date, time);
      const mode =
        madeBy >> 8 === HOST_UNIX ? (externalAttrs >>> 16) & S_IFMT : 0;
      if (path.endsWith("/") || path.endsWith("\\") || mode === S_IFDIR) {
        members.push({ kind: "dir", path, mtimeMs });
        continue;
      }
      if (mode === S_IFLNK) {
        members.push({ kind: "other", path, mtimeMs });
        continue;
      }
      const locator: ZipLocator = {
        flags,
        method,
        compressedSize: extras.compressedSize ?? compressedSize32,
        size: extras.size ?? size32,
        localHeaderOffset: extras.localHeaderOffset ?? localOffset32,
      };
      members.push({
        kind: "file",
        path,
        size: locator.size,
        mtimeMs,
        open: () => openZipMember(file, locator),
      });
    }
    return { kind: "ok", members };
  } finally {
    await fh.close();
  }
}

/**
 * A Node stream as a web stream, pulled chunk by chunk (back-pressure kept);
 * a stream error rejects the pull, which errors the web stream, and a cancel
 * destroys the source.
 */
function webStream(source: Readable): ReadableStream<Uint8Array> {
  const chunks: AsyncIterator<Buffer> = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done === true) controller.close();
      else controller.enqueue(next.value);
    },
    cancel() {
      source.destroy();
    },
  });
}

/**
 * Where a member's data starts: past its local header, whose name and extra
 * lengths may differ from the central record's.
 */
async function dataOffset(
  file: string,
  at: ZipLocator,
): Promise<number | null> {
  const fh = await open(file, "r");
  try {
    const local = await readAt(fh, at.localHeaderOffset, LOCAL_SIZE);
    if (local.length < LOCAL_SIZE || local.readUInt32LE(0) !== LOCAL_SIG)
      return null;
    return (
      at.localHeaderOffset +
      LOCAL_SIZE +
      local.readUInt16LE(26) +
      local.readUInt16LE(28)
    );
  } finally {
    await fh.close();
  }
}

/**
 * A member's bytes: a stored member is a byte-exact `Blob` window of the zip
 * (so it slices for `Range`), a deflated one an inflating stream. Encrypted
 * members and any other compression method are typed as unreadable.
 */
export async function openZipMember(
  file: string,
  at: ZipLocator,
): Promise<MemberBytes> {
  if ((at.flags & FLAG_ENCRYPTED) !== 0)
    return { kind: "unreadable", reason: "encrypted" };
  if (at.method !== METHOD_STORED && at.method !== METHOD_DEFLATED)
    return { kind: "unreadable", reason: "unsupported-method" };
  const start = await dataOffset(file, at);
  if (start === null) return corrupt;
  if (at.method === METHOD_STORED) {
    return {
      kind: "ok",
      size: at.size,
      body: Bun.file(file).slice(start, start + at.compressedSize),
    };
  }
  const inflate = createInflateRaw();
  if (at.compressedSize === 0) {
    inflate.end();
  } else {
    const source = createReadStream(file, {
      start,
      end: start + at.compressedSize - 1,
    });
    // `pipe` does not forward a source error: hand it to the stream the reader holds.
    source.on("error", (err) => inflate.destroy(err));
    source.pipe(inflate);
  }
  return {
    kind: "ok",
    size: at.size,
    body: webStream(inflate),
  };
}

export const zipFormat = defineArchiveFormat({
  id: "zip",
  claims: (name) => name.toLowerCase().endsWith(".zip"),
  index: indexZip,
});
