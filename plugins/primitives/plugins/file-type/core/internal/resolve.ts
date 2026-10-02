import {
  BY_EXTENSION,
  BY_NAME,
  BY_NAME_PREFIX,
  DOC_EXTENSIONS,
  GENERIC_ICON,
  type FileType,
} from "./table";

/** The last segment of a path (either separator), as the file is named on disk. */
function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/**
 * Every extension `name` carries, longest first: `foo.test.ts` →
 * `test.ts`, `ts`. A leading dot is not an extension separator — `.bashrc`
 * has none, `.eslintrc.json` has `json`.
 */
function extensionsOf(lower: string): string[] {
  const body = lower.startsWith(".") ? lower.slice(1) : lower;
  const out: string[] = [];
  for (let i = body.indexOf("."); i !== -1; i = body.indexOf(".", i + 1)) {
    const ext = body.slice(i + 1);
    if (ext !== "") out.push(ext);
  }
  return out;
}

function byExtension(lower: string): FileType | undefined {
  for (const ext of extensionsOf(lower)) {
    const row = BY_EXTENSION[ext];
    if (row) return row;
  }
  return undefined;
}

function matchesPrefix(
  lower: string,
  prefix: string,
  docOnly: boolean,
): boolean {
  if (!lower.startsWith(prefix)) return false;
  const rest = lower.slice(prefix.length);
  // The prefix must end a word: `license-mit`, `license.md`, not `licensed`.
  const endsWord = rest === "" || prefix.endsWith(".") || /^[.\-_]/.test(rest);
  if (!endsWord) return false;
  if (!docOnly) return true;
  // A document: no extension, or a text one (`readme-generator.py` is Python).
  const last = extensionsOf(lower).at(-1);
  return last === undefined || DOC_EXTENSIONS.has(last);
}

/** A special name's row, with its extension's preview when it names none. */
function withPreviewFrom(row: FileType, lower: string): FileType {
  if (row.preview !== undefined) return row;
  const preview = byExtension(lower)?.preview;
  return preview === undefined ? row : { ...row, preview };
}

/**
 * What a file is, from its name (a bare name or a path; case-insensitive):
 * a special file name (`package.json`, `Dockerfile`, `.gitignore`,
 * `CLAUDE.md`) beats a name family (`LICENSE-MIT`, `vite.config.ts`), which
 * beats the extension, longest first (`foo.test.ts` before `.ts`). A name with
 * no row draws the generic page glyph and is called `<EXT> file`, or `File`
 * without an extension.
 */
export function fileTypeOf(name: string): FileType {
  const lower = baseName(name).toLowerCase();
  const named = BY_NAME[lower];
  if (named) return withPreviewFrom(named, lower);
  for (const row of BY_NAME_PREFIX) {
    if (matchesPrefix(lower, row.prefix, row.docOnly === true)) {
      return withPreviewFrom(row.type, lower);
    }
  }
  const byExt = byExtension(lower);
  if (byExt) return byExt;
  const exts = extensionsOf(lower);
  const last = exts[exts.length - 1];
  return {
    icon: GENERIC_ICON,
    tone: "neutral",
    label: last === undefined ? "File" : `${last.toUpperCase()} file`,
  };
}
