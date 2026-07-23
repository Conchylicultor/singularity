/**
 * Argv parsing for e2e scripts.
 *
 * Replaces the byte-identical `arg(name, fallback)` copy that lived in 22 of the
 * 29 scripts, plus the three divergent missing-argument endings (`exit(1)`,
 * `exit(2)`, and one that silently defaulted).
 */

export function arg(name: string): string | undefined;
export function arg(name: string, fallback: string): string;
export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

/** Numeric flag. A non-numeric value is a caller error, not a silent 0. */
export function numArg(name: string, fallback: number): number {
  const raw = arg(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) usage(`--${name} expects a number, got ${raw}`);
  return n;
}

/** Presence-only flag (`--headed`, `--verbose`). */
export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Print a usage line and exit non-zero. Never returns. */
export function usage(line: string): never {
  console.error(line);
  process.exit(2);
}

/** A flag with no sensible default — absent means the caller misinvoked us. */
export function requireArg(name: string, usageLine: string): string {
  const value = arg(name);
  if (value === undefined || value === "") usage(usageLine);
  return value;
}
