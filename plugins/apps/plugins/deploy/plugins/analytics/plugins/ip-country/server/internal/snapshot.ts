import { yieldMacrotask } from "@plugins/packages/plugins/macrotask-yield/core";
import { parseIp, parseIpLiteral } from "./parse-ip";

/**
 * The compact binary form of a DB-IP country CSV. The CSV is parsed once per
 * download (in the refresh job); a backend reads this file straight into
 * typed-array views and never re-parses 717k text rows.
 *
 * Layout (host byte order — the file is only ever built and read on the same
 * machine, and every target is little-endian):
 *
 * ```
 * header   6 × u32 LE  magic, version, source month (YYYYMM), code count, v4 rows, v6 rows
 * codes    2 × code count ASCII bytes, then padding to an 8-byte boundary
 * v4       start u32[n], end u32[n], code index u16[n], padding to 8
 * v6       start hi u64[n], start lo u64[n], end hi u64[n], end lo u64[n], code index u16[n]
 * ```
 */
const MAGIC = 0x43435049; // "IPCC" little-endian
export const SNAPSHOT_FORMAT_VERSION = 1;
const HEADER_WORDS = 6;
export const SNAPSHOT_HEADER_BYTES = HEADER_WORDS * 4;

/** The code DB-IP uses for private and reserved ranges. */
export const UNLISTED_CODE = "ZZ";

/** Rows parsed between two yields to the event loop (~15 ms of parsing on a laptop). */
const ROWS_PER_CHUNK = 5_000;

export interface Snapshot {
  sourceMonth: number;
  codes: readonly string[];
  v4Start: Uint32Array;
  v4End: Uint32Array;
  v4Code: Uint16Array;
  v6StartHi: BigUint64Array;
  v6StartLo: BigUint64Array;
  v6EndHi: BigUint64Array;
  v6EndLo: BigUint64Array;
  v6Code: Uint16Array;
}

export type SnapshotLookup =
  { kind: "found"; country: string } | { kind: "unlisted" };

const pad8 = (n: number) => (n + 7) & ~7;

/** A typed array that doubles as rows arrive; `view()` is the filled prefix. */
class Growable<T extends Uint32Array | Uint16Array | BigUint64Array> {
  private length = 0;
  constructor(
    private data: T,
    private readonly make: (size: number) => T,
  ) {}
  push(value: T[number]): void {
    if (this.length === this.data.length) {
      const next = this.make(this.data.length * 2);
      next.set(this.data as never);
      this.data = next;
    }
    (this.data as { [i: number]: T[number] })[this.length++] = value;
  }
  view(): T {
    return this.data.subarray(0, this.length) as T;
  }
}

const u32 = () =>
  new Growable(new Uint32Array(1024), (n) => new Uint32Array(n));
const u16 = () =>
  new Growable(new Uint16Array(1024), (n) => new Uint16Array(n));
const u64 = () =>
  new Growable(new BigUint64Array(1024), (n) => new BigUint64Array(n));

function rowError(lineNo: number, line: string, why: string): Error {
  return new Error(
    `ip-country: CSV line ${lineNo} (${JSON.stringify(line)}): ${why}`,
  );
}

/**
 * Parse a DB-IP `start,end,CC` CSV (no header row) into snapshot bytes.
 *
 * Nothing is sorted: DB-IP is already ordered. Instead this ASSERTS that each
 * family's ranges ascend without overlapping, and throws naming the row
 * otherwise — a lookup is a binary search, which silently answers wrong on
 * unordered input. Yields to the event loop every {@link ROWS_PER_CHUNK} rows
 * so a backend keeps serving requests while a refresh parses ~90 MB of text.
 */
export async function buildSnapshot(
  csvText: string,
  sourceMonth: number,
): Promise<Uint8Array> {
  const codes: string[] = [];
  const codeIndex = new Map<string, number>();
  const indexOf = (code: string) => {
    let i = codeIndex.get(code);
    if (i === undefined) {
      i = codes.length;
      codes.push(code);
      codeIndex.set(code, i);
    }
    return i;
  };
  const v4Start = u32();
  const v4End = u32();
  const v4Code = u16();
  const v6StartHi = u64();
  const v6StartLo = u64();
  const v6EndHi = u64();
  const v6EndLo = u64();
  const v6Code = u16();
  let lastV4End = -1;
  let lastV6End: { hi: bigint; lo: bigint } | null = null;

  let pos = 0;
  let lineNo = 0;
  while (pos < csvText.length) {
    let nl = csvText.indexOf("\n", pos);
    if (nl === -1) nl = csvText.length;
    const line = csvText.slice(pos, nl).trim();
    pos = nl + 1;
    lineNo++;
    if (lineNo % ROWS_PER_CHUNK === 0) await yieldMacrotask();
    if (line === "") continue;

    const fields = line.split(",");
    if (fields.length !== 3)
      throw rowError(lineNo, line, "expected start,end,CC");
    const [startText, endText, code] = fields as [string, string, string];
    if (!/^[A-Z]{2}$/.test(code))
      throw rowError(lineNo, line, "bad country code");
    const start = parseIpLiteral(startText);
    const end = parseIpLiteral(endText);

    if (start.kind === "v4" && end.kind === "v4") {
      if (end.value < start.value)
        throw rowError(lineNo, line, "end before start");
      if (start.value <= lastV4End) {
        throw rowError(
          lineNo,
          line,
          "range out of order or overlapping the previous one",
        );
      }
      lastV4End = end.value;
      v4Start.push(start.value);
      v4End.push(end.value);
      v4Code.push(indexOf(code));
    } else if (start.kind === "v6" && end.kind === "v6") {
      if (compare128(end.hi, end.lo, start.hi, start.lo) < 0) {
        throw rowError(lineNo, line, "end before start");
      }
      if (
        lastV6End &&
        compare128(start.hi, start.lo, lastV6End.hi, lastV6End.lo) <= 0
      ) {
        throw rowError(
          lineNo,
          line,
          "range out of order or overlapping the previous one",
        );
      }
      lastV6End = { hi: end.hi, lo: end.lo };
      v6StartHi.push(start.hi);
      v6StartLo.push(start.lo);
      v6EndHi.push(end.hi);
      v6EndLo.push(end.lo);
      v6Code.push(indexOf(code));
    } else {
      throw rowError(
        lineNo,
        line,
        "start and end are not addresses of one family",
      );
    }
  }
  if (codes.length > 0xffff) {
    throw new Error(
      `ip-country: ${codes.length} distinct codes exceed the u16 index`,
    );
  }

  const n4 = v4Start.view().length;
  const n6 = v6StartHi.view().length;
  const codesOffset = SNAPSHOT_HEADER_BYTES;
  const v4Offset = pad8(codesOffset + codes.length * 2);
  const v6Offset = pad8(v4Offset + n4 * 4 * 2 + n4 * 2);
  const total = v6Offset + n6 * 8 * 4 + n6 * 2;

  const buffer = new ArrayBuffer(total);
  const header = new DataView(buffer, 0, SNAPSHOT_HEADER_BYTES);
  [MAGIC, SNAPSHOT_FORMAT_VERSION, sourceMonth, codes.length, n4, n6].forEach(
    (word, i) => header.setUint32(i * 4, word, true),
  );
  const bytes = new Uint8Array(buffer);
  codes.forEach((code, i) => {
    bytes[codesOffset + i * 2] = code.charCodeAt(0);
    bytes[codesOffset + i * 2 + 1] = code.charCodeAt(1);
  });
  new Uint32Array(buffer, v4Offset, n4).set(v4Start.view());
  new Uint32Array(buffer, v4Offset + n4 * 4, n4).set(v4End.view());
  new Uint16Array(buffer, v4Offset + n4 * 8, n4).set(v4Code.view());
  new BigUint64Array(buffer, v6Offset, n6).set(v6StartHi.view());
  new BigUint64Array(buffer, v6Offset + n6 * 8, n6).set(v6StartLo.view());
  new BigUint64Array(buffer, v6Offset + n6 * 16, n6).set(v6EndHi.view());
  new BigUint64Array(buffer, v6Offset + n6 * 24, n6).set(v6EndLo.view());
  new Uint16Array(buffer, v6Offset + n6 * 32, n6).set(v6Code.view());
  return bytes;
}

export interface SnapshotHeader {
  sourceMonth: number;
  codeCount: number;
  v4Count: number;
  v6Count: number;
}

export type SnapshotHeaderCheck =
  | { kind: "valid"; header: SnapshotHeader }
  | { kind: "invalid"; reason: string };

/**
 * Check a snapshot header's magic and version, so a file of another format can
 * never be read as data. Only the first {@link SNAPSHOT_HEADER_BYTES} are read.
 */
export function checkSnapshotHeader(bytes: Uint8Array): SnapshotHeaderCheck {
  if (bytes.byteLength < SNAPSHOT_HEADER_BYTES) {
    return { kind: "invalid", reason: "shorter than its header" };
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    SNAPSHOT_HEADER_BYTES,
  );
  const word = (i: number) => view.getUint32(i * 4, true);
  if (word(0) !== MAGIC) return { kind: "invalid", reason: "bad magic" };
  if (word(1) !== SNAPSHOT_FORMAT_VERSION) {
    return {
      kind: "invalid",
      reason: `format ${word(1)}, expected ${SNAPSHOT_FORMAT_VERSION}`,
    };
  }
  return {
    kind: "valid",
    header: {
      sourceMonth: word(2),
      codeCount: word(3),
      v4Count: word(4),
      v6Count: word(5),
    },
  };
}

/**
 * Typed-array views over snapshot bytes, with no copy when the bytes sit on an
 * 8-byte boundary of their buffer (a whole-file read always does). Throws on a
 * wrong magic, version, or a length that does not match the header.
 */
export function loadSnapshot(input: Uint8Array): Snapshot {
  const check = checkSnapshotHeader(input);
  if (check.kind === "invalid") {
    throw new Error(`ip-country: not a readable snapshot (${check.reason})`);
  }
  const { header } = check;
  const bytes = input.byteOffset % 8 === 0 ? input : input.slice();
  const { codeCount, v4Count: n4, v6Count: n6 } = header;
  const codesOffset = SNAPSHOT_HEADER_BYTES;
  const v4Offset = pad8(codesOffset + codeCount * 2);
  const v6Offset = pad8(v4Offset + n4 * 10);
  const total = v6Offset + n6 * 34;
  if (bytes.byteLength !== total) {
    throw new Error(
      `ip-country: snapshot is ${bytes.byteLength} bytes, its header implies ${total}`,
    );
  }
  const { buffer, byteOffset: base } = bytes;
  const codes: string[] = [];
  for (let i = 0; i < codeCount; i++) {
    codes.push(
      String.fromCharCode(
        bytes[codesOffset + i * 2]!,
        bytes[codesOffset + i * 2 + 1]!,
      ),
    );
  }
  return {
    sourceMonth: header.sourceMonth,
    codes,
    v4Start: new Uint32Array(buffer, base + v4Offset, n4),
    v4End: new Uint32Array(buffer, base + v4Offset + n4 * 4, n4),
    v4Code: new Uint16Array(buffer, base + v4Offset + n4 * 8, n4),
    v6StartHi: new BigUint64Array(buffer, base + v6Offset, n6),
    v6StartLo: new BigUint64Array(buffer, base + v6Offset + n6 * 8, n6),
    v6EndHi: new BigUint64Array(buffer, base + v6Offset + n6 * 16, n6),
    v6EndLo: new BigUint64Array(buffer, base + v6Offset + n6 * 24, n6),
    v6Code: new Uint16Array(buffer, base + v6Offset + n6 * 32, n6),
  };
}

function compare128(
  aHi: bigint,
  aLo: bigint,
  bHi: bigint,
  bLo: bigint,
): number {
  if (aHi !== bHi) return aHi < bHi ? -1 : 1;
  if (aLo !== bLo) return aLo < bLo ? -1 : 1;
  return 0;
}

/** Index of the last range whose start is ≤ the address, or -1. */
function lastStartAtOrBefore(
  count: number,
  startsAfter: (i: number) => boolean,
): number {
  let lo = 0;
  let hi = count; // first index whose start is > the address
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (startsAfter(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo - 1;
}

/**
 * The country of an address string in a loaded snapshot. `unlisted` covers
 * DB-IP's `ZZ`, an address in no range, and a string that is not an address.
 */
export function lookupIn(snapshot: Snapshot, ip: string): SnapshotLookup {
  const parsed = parseIp(ip);
  let codeIdx: number | undefined;
  if (parsed.kind === "v4") {
    const { v4Start, v4End, v4Code } = snapshot;
    const i = lastStartAtOrBefore(
      v4Start.length,
      (m) => v4Start[m]! > parsed.value,
    );
    if (i >= 0 && parsed.value <= v4End[i]!) codeIdx = v4Code[i];
  } else if (parsed.kind === "v6") {
    const { v6StartHi, v6StartLo, v6EndHi, v6EndLo, v6Code } = snapshot;
    const i = lastStartAtOrBefore(
      v6StartHi.length,
      (m) => compare128(v6StartHi[m]!, v6StartLo[m]!, parsed.hi, parsed.lo) > 0,
    );
    if (
      i >= 0 &&
      compare128(parsed.hi, parsed.lo, v6EndHi[i]!, v6EndLo[i]!) <= 0
    ) {
      codeIdx = v6Code[i];
    }
  }
  if (codeIdx === undefined) return { kind: "unlisted" };
  const country = snapshot.codes[codeIdx];
  if (country === undefined) {
    throw new Error(`ip-country: code index ${codeIdx} outside the code table`);
  }
  return country === UNLISTED_CODE
    ? { kind: "unlisted" }
    : { kind: "found", country };
}
