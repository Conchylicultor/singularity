/** The attributes of an active-data open tag (`<task model="opus">` → `{ model: "opus" }`); a bare name is `""`. */
export function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w[\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]!] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}
