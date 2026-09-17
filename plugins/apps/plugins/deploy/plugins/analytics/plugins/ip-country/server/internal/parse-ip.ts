/**
 * An IP address as a number, per family: IPv4 as an unsigned 32-bit `number`,
 * IPv6 as its high and low 64-bit halves. Anything that is not an address is
 * the `invalid` arm — never `null`, so "not an address" cannot pass as a value.
 */
export type ParsedIp =
  | { kind: "v4"; value: number }
  | { kind: "v6"; hi: bigint; lo: bigint }
  | { kind: "invalid" };

const INVALID: ParsedIp = { kind: "invalid" };
const DECIMAL_OCTET = /^(0|[1-9][0-9]{0,2})$/;
const HEXTET = /^[0-9a-fA-F]{1,4}$/;

function parseV4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    // Leading zeros are refused: `010` reads as octal in some parsers.
    if (!DECIMAL_OCTET.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function parseV6Groups(text: string): number[] | null {
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (half: string, allowDotted: boolean): number[] | null => {
    if (half === "") return [];
    const pieces = half.split(":");
    const groups: number[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]!;
      if (allowDotted && i === pieces.length - 1 && piece.includes(".")) {
        const v4 = parseV4(piece);
        if (v4 === null) return null;
        groups.push(Math.floor(v4 / 65536), v4 % 65536);
      } else {
        if (!HEXTET.test(piece)) return null;
        groups.push(parseInt(piece, 16));
      }
    }
    return groups;
  };
  if (halves.length === 1) {
    const groups = toGroups(halves[0]!, true);
    return groups?.length === 8 ? groups : null;
  }
  const head = toGroups(halves[0]!, false);
  const tail = toGroups(halves[1]!, true);
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  // `::` stands for at least one zero group.
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

function halfOf(groups: number[], from: number): bigint {
  let value = 0n;
  for (let i = from; i < from + 4; i++) {
    value = (value << 16n) | BigInt(groups[i]!);
  }
  return value;
}

/**
 * Parse an address exactly as written: an IPv6 literal stays IPv6 even when it
 * is IPv4-mapped. The snapshot builder uses this, since a CSV row's family is
 * the table it belongs to.
 */
export function parseIpLiteral(text: string): ParsedIp {
  if (text.includes(":")) {
    // A zone id (`fe80::1%en0`) names an interface, not a place.
    if (text.includes("%")) return INVALID;
    const groups = parseV6Groups(text);
    if (!groups) return INVALID;
    return { kind: "v6", hi: halfOf(groups, 0), lo: halfOf(groups, 4) };
  }
  const v4 = parseV4(text);
  return v4 === null ? INVALID : { kind: "v4", value: v4 };
}

const MAPPED_PREFIX = 0xffffn;

/**
 * Parse a client address for lookup. An IPv4-mapped IPv6 address
 * (`::ffff:1.2.3.4`, what a dual-stack socket reports for an IPv4 peer) is
 * turned back into the IPv4 address it carries.
 */
export function parseIp(text: string): ParsedIp {
  const parsed = parseIpLiteral(text.trim());
  if (
    parsed.kind === "v6" &&
    parsed.hi === 0n &&
    parsed.lo >> 32n === MAPPED_PREFIX
  ) {
    return { kind: "v4", value: Number(parsed.lo & 0xffffffffn) };
  }
  return parsed;
}
