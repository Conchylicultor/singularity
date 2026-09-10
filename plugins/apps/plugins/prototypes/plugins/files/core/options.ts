/**
 * Prototype options — the variants a prototype lets the reader flip between
 * (a palette, a pane style), declared in its own `index.html`:
 *
 * ```html
 * <html data-palette="violet">
 * <meta name="prototype-option" content="palette: violet | indigo | azure" />
 * ```
 *
 * The `<meta>` lists the values, in picker order; the `data-<name>` attribute
 * the author writes on `<html>` IS the default. So the page carries the
 * attribute in every context — double-clicked off disk, in the thumbnail
 * render, in the app — and the app only ever OVERWRITES it with the picked
 * value (the server stamps it, see `server/internal/handlers.ts`). The picker
 * is drawn by the app, outside the page, so a prototype contains no switcher of
 * its own.
 *
 * Pure: the HTML read that feeds `foldOptions` is `readOptionSource`
 * (`option-source.ts`), the one HTMLRewriter pass the list, the validator and
 * the server share.
 */

/** One option, valid against its declaration and its page's default. */
export interface PrototypeOption {
  /** `palette` — also the `data-palette` attribute and the query key. */
  name: string;
  /** Every value, in picker order. At least two, all distinct. */
  values: readonly [string, string, ...string[]];
  /** The value the page's own `<html data-<name>>` carries. One of `values`. */
  default: string;
}

/**
 * One `<meta name="prototype-option">` line, parsed. Syntax only — whether the
 * page carries a default for it is `foldOptions`' business, since that needs
 * the `<html>` attributes too.
 */
export type OptionDeclaration =
  | {
      kind: "declared";
      name: string;
      values: readonly [string, string, ...string[]];
    }
  | { kind: "malformed"; raw: string; reason: string };

/**
 * Picked values, keyed by option name, each one of its option's declared
 * values. Insertion order is declaration order, which is the order they are
 * written into a URL.
 */
export type OptionPicks = Readonly<Record<string, string>>;

/** An option name: a lowercase identifier (it becomes a `data-*` attribute). */
const NAME_RE = /^[a-z][a-z0-9-]*$/;
/** A value: lowercase letters, digits and dashes (`3-octaves` is fine). */
const VALUE_RE = /^[a-z0-9][a-z0-9-]*$/;
/** The query key the app's reload cache-bust already owns. */
const RESERVED_NAMES = new Set(["v"]);

const SYNTAX = '"<name>: <value> | <value>"';

/** Parse one `content` attribute: `palette: violet | indigo | azure`. */
export function parseOptionDeclaration(raw: string): OptionDeclaration {
  const trimmed = raw.trim();
  const malformed = (reason: string): OptionDeclaration => ({
    kind: "malformed",
    raw: trimmed,
    reason,
  });

  const colon = trimmed.indexOf(":");
  if (colon < 0) return malformed('there is no "<name>:" prefix');

  const name = trimmed.slice(0, colon).trim();
  if (name === "")
    return malformed("the option name before the colon is empty");
  if (!NAME_RE.test(name)) {
    return malformed(
      "an option name is lowercase letters, digits and dashes, starting with a letter",
    );
  }
  if (RESERVED_NAMES.has(name)) {
    return malformed(
      `"${name}" is reserved — the app uses it to reload the frame on edit`,
    );
  }

  const values = trimmed
    .slice(colon + 1)
    .split("|")
    .map((v) => v.trim());
  if (values.some((v) => v === "")) {
    return malformed("a value between two | is empty");
  }
  const bad = values.find((v) => !VALUE_RE.test(v));
  if (bad !== undefined) {
    return malformed(
      `"${bad}" is not a value — values are lowercase letters, digits and dashes`,
    );
  }
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return malformed(`"${v}" is listed twice`);
    seen.add(v);
  }
  const [first, second, ...rest] = values;
  if (first === undefined || second === undefined) {
    return malformed("an option needs at least two values");
  }
  return { kind: "declared", name, values: [first, second, ...rest] };
}

/**
 * What the HTML says about options, before any judgement: every
 * `<meta name="prototype-option">` content in document order, and the `data-*`
 * attributes on `<html>` (keyed WITHOUT the `data-` prefix).
 */
export interface OptionSource {
  declarations: readonly string[];
  htmlData: Readonly<Record<string, string>>;
}

/**
 * The valid options, plus one problem detail per line that cannot be one. A
 * broken line is left out of the picker — its problem says why, on the card.
 */
export function foldOptions(source: OptionSource): {
  options: PrototypeOption[];
  problems: string[];
} {
  const options: PrototypeOption[] = [];
  const problems: string[] = [];

  for (const raw of source.declarations) {
    const d = parseOptionDeclaration(raw);
    if (d.kind === "malformed") {
      problems.push(
        `<meta name="prototype-option" content="${d.raw}"> is malformed — ${d.reason}. Write it as ${SYNTAX}`,
      );
      continue;
    }
    if (options.some((o) => o.name === d.name)) {
      problems.push(
        `the option "${d.name}" is declared twice — only the first <meta name="prototype-option"> for it is used`,
      );
      continue;
    }
    const def = source.htmlData[d.name];
    if (def === undefined) {
      problems.push(
        `the option "${d.name}" has no default — put it on the page's own <html>, e.g. <html data-${d.name}="${d.values[0]}">, so the page renders the same off disk as in the app`,
      );
      continue;
    }
    if (!d.values.includes(def)) {
      problems.push(
        `<html data-${d.name}="${def}"> is not one of the option's values (${d.values.join(" | ")})`,
      );
      continue;
    }
    options.push({ name: d.name, values: d.values, default: def });
  }

  return { options, problems };
}

/**
 * Remembered picks → the ones still valid against today's declaration, minus
 * defaults (the page already carries those, and leaving them out keeps an
 * untouched prototype's URL exactly what it was).
 *
 * Dropping a stale pick is correct, not a swallowed failure: it is a remembered
 * preference for a value the author has since removed. A URL naming one is a
 * different matter — see `picksFromQuery`.
 */
export function resolvePicks(
  options: readonly PrototypeOption[],
  stored: Readonly<Record<string, string>>,
): OptionPicks {
  const picks: Record<string, string> = {};
  for (const o of options) {
    const v = stored[o.name];
    if (v !== undefined && v !== o.default && o.values.includes(v)) {
      picks[o.name] = v;
    }
  }
  return picks;
}

/** The value an option shows under `picks`: the pick, else the page's default. */
export function pickedValue(
  option: PrototypeOption,
  picks: OptionPicks,
): string {
  return picks[option.name] ?? option.default;
}

/**
 * A request's query → picks, for the server. Every key but `v` must name a
 * declared option and every value one of its values: a URL that names anything
 * else is a broken link and FAILS, rather than quietly rendering the default
 * and letting the reader believe they are looking at the variant they asked for.
 */
export function picksFromQuery(
  options: readonly PrototypeOption[],
  search: URLSearchParams,
): { ok: true; picks: OptionPicks } | { ok: false; reason: string } {
  const picks: Record<string, string> = {};
  for (const [key, value] of search) {
    if (RESERVED_NAMES.has(key)) continue;
    const option = options.find((o) => o.name === key);
    if (!option) {
      const declared =
        options.length === 0
          ? "it declares none"
          : `it declares: ${options.map((o) => o.name).join(", ")}`;
      return {
        ok: false,
        reason: `"${key}" is not an option of this prototype (${declared})`,
      };
    }
    if (key in picks) {
      return { ok: false, reason: `"${key}" is given twice` };
    }
    if (!option.values.includes(value)) {
      return {
        ok: false,
        reason: `"${value}" is not a value of "${key}" (its values: ${option.values.join(" | ")})`,
      };
    }
    picks[key] = value;
  }
  return { ok: true, picks };
}

/** `soft-tray` → "Soft tray", `88-keys` → "88 keys": the picker's label for a token. */
export function humanizeToken(token: string): string {
  const spaced = token.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
