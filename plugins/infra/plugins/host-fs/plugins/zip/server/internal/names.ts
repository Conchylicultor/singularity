/** IBM code page 437, bytes 0x80–0xFF: the encoding of a zip name not marked UTF-8. */
const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

function decodeCp437(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes)
    out += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80];
  return out;
}

/** UTF-8 if the bytes are valid UTF-8, else `null`. */
function tryUtf8(bytes: Uint8Array): string | null {
  try {
    return strictUtf8.decode(bytes);
  } catch (err) {
    if (err instanceof TypeError) return null;
    throw err;
  }
}

/**
 * A member's name as text.
 *
 * - The Info-ZIP Unicode Path extra field wins when its CRC matches the raw
 *   name (a stale one, left by a tool that renamed the entry, is ignored).
 * - A name flagged UTF-8 (general-purpose bit 11) is UTF-8.
 * - An unflagged name is still read as UTF-8 when it is valid UTF-8: macOS's
 *   Archive Utility and many Unix tools write UTF-8 names without the flag,
 *   and a CP437 name with high bytes is almost never valid UTF-8.
 * - Otherwise it is CP437, the format's original encoding.
 */
export function decodeZipName(
  raw: Uint8Array,
  flaggedUtf8: boolean,
  unicodePath?: { nameCrc: number; name: string },
): string {
  if (unicodePath !== undefined && Bun.hash.crc32(raw) === unicodePath.nameCrc)
    return unicodePath.name;
  if (flaggedUtf8) return new TextDecoder().decode(raw);
  return tryUtf8(raw) ?? decodeCp437(raw);
}
