/**
 * Non-fatal diagnostic notices.
 *
 * Some things a script does are *diagnostics*, not assertions — a screenshot is
 * the canonical one: you look at it afterwards, and whether it was written says
 * nothing about whether the behaviour under test is correct. A run of
 * `page/editor`'s inline-format-verify.ts died on a `snap()` after 31 assertions
 * had already passed, because `page.screenshot()` awaits `document.fonts.ready`
 * and a wedged font load blew the 30s default. A capture should never have that
 * power.
 *
 * Demoting it must not mean silencing it (the repo's fail-loudly rule): a failed
 * diagnostic is printed the moment it happens AND collected here, so
 * `report().finish()` can surface it in the run summary. Only the exit code
 * stops depending on it.
 *
 * Module-level and per-process, which matches `report()` already owning
 * `process.exit`.
 */

const notices: string[] = [];

/** Record a non-fatal notice for the end-of-run summary. */
export function pushDiagnostic(line: string): void {
  notices.push(line);
}

/** Take the recorded notices, leaving the list empty. */
export function drainDiagnostics(): string[] {
  return notices.splice(0, notices.length);
}
