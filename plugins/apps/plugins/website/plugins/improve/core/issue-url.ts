/**
 * GitHub rejects a new-issue link much past 8,000 characters, and the text is
 * the only part of the link a visitor controls. So the whole URL is held under
 * this, with room to spare, by cutting the text — never the title, the page or
 * the auto-deploy line, which are what make the issue actionable.
 */
export const MAX_ISSUE_URL_LENGTH = 7_500;

/** The longest title GitHub's list shows without clipping it itself. */
const MAX_TITLE_LENGTH = 72;

/** GitHub applies it only for a visitor with triage rights; others file unlabelled. */
const LABEL = "idea";

export interface IssueDraft {
  /** The repository's home URL — `https://github.com/<owner>/<repo>`. */
  repoUrl: string;
  /** What the visitor wrote, as typed. */
  text: string;
  /** The page they were on when they wrote it. */
  pageUrl: string;
  /** Whether they asked for the change to ship without a review. */
  autoDeploy: boolean;
}

/**
 * The issue's title: the visitor's first non-empty line, cut to
 * {@link MAX_TITLE_LENGTH} characters (the ellipsis included) when longer.
 *
 * Cut by code point, not UTF-16 unit, so an emoji at the boundary is dropped
 * whole rather than halved into a lone surrogate.
 */
export function issueTitle(text: string): string {
  const first =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== "") ?? "";
  const chars = Array.from(first);
  return chars.length > MAX_TITLE_LENGTH
    ? `${chars.slice(0, MAX_TITLE_LENGTH - 1).join("")}…`
    : first;
}

function issueBody(text: string, { pageUrl, autoDeploy }: IssueDraft): string {
  return [
    text,
    "",
    "---",
    `Page: ${pageUrl}`,
    `Auto-deploy: ${autoDeploy ? "yes" : "no (review first)"}`,
    "Filed from the Improve button on equin.ai",
  ].join("\n");
}

function urlFor(draft: IssueDraft, title: string, bodyText: string): string {
  const query = new URLSearchParams({
    title,
    body: issueBody(bodyText, draft),
    labels: LABEL,
  });
  return `${draft.repoUrl.replace(/\/+$/, "")}/issues/new?${query.toString()}`;
}

/**
 * A link to GitHub's new-issue form, prefilled with the visitor's idea: the
 * title from its first line, and a body holding the whole text, then a rule,
 * the page it was written on and the auto-deploy choice.
 *
 * The link is always under {@link MAX_ISSUE_URL_LENGTH}. When the text is too
 * long for that, the body carries the longest prefix of it that fits, ended
 * with "…" — the visitor lands in GitHub's editor and can paste the rest. The
 * encoded length of a prefix is not proportional to its length in characters
 * (one emoji encodes to twelve), so the fitting prefix is found by bisection
 * rather than estimated.
 *
 * Throws if even an empty text does not fit: that means the page URL alone is
 * over the cap, and a link GitHub would reject is not one to hand a visitor.
 */
export function buildIssueUrl(draft: IssueDraft): string {
  const text = draft.text.trim();
  const title = issueTitle(text);
  const whole = urlFor(draft, title, text);
  if (whole.length <= MAX_ISSUE_URL_LENGTH) return whole;

  const chars = Array.from(text);
  const cut = (n: number) =>
    urlFor(draft, title, `${chars.slice(0, n).join("")}…`);
  if (cut(0).length > MAX_ISSUE_URL_LENGTH) {
    throw new Error(
      `buildIssueUrl: the issue link is over ${MAX_ISSUE_URL_LENGTH} characters with no text at all (page URL is ${draft.pageUrl.length} characters)`,
    );
  }
  // Largest n whose cut fits: `lo` always fits, `hi` never does.
  let lo = 0;
  let hi = chars.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cut(mid).length <= MAX_ISSUE_URL_LENGTH) lo = mid;
    else hi = mid;
  }
  return cut(lo);
}
