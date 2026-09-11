import { describe, expect, test } from "bun:test";
import { buildIssueUrl, issueTitle, MAX_ISSUE_URL_LENGTH } from "./issue-url";

const REPO = "https://github.com/owner/repo";
const PAGE = "https://equin.ai/website/harness";

function parse(url: string) {
  const parsed = new URL(url);
  return {
    path: `${parsed.origin}${parsed.pathname}`,
    title: parsed.searchParams.get("title"),
    body: parsed.searchParams.get("body") ?? "",
    labels: parsed.searchParams.get("labels"),
  };
}

describe("issueTitle", () => {
  test("is the first non-empty line, trimmed", () => {
    expect(issueTitle("\n  \n  Show a demo  \nunder the headline")).toBe(
      "Show a demo",
    );
  });

  test("keeps a line of exactly 72 characters whole", () => {
    const line = "x".repeat(72);
    expect(issueTitle(line)).toBe(line);
  });

  test("cuts a longer line to 72 characters, ellipsis included", () => {
    const title = issueTitle("y".repeat(200));
    expect(Array.from(title)).toHaveLength(72);
    expect(title.endsWith("…")).toBe(true);
    expect(title.startsWith("y".repeat(71))).toBe(true);
  });

  test("never halves an emoji at the cut", () => {
    const title = issueTitle("🙂".repeat(100));
    expect(title).toBe(`${"🙂".repeat(71)}…`);
  });
});

describe("buildIssueUrl", () => {
  test("opens the repo's new-issue form with the title, body and label", () => {
    const url = buildIssueUrl({
      repoUrl: REPO,
      text: "Show a 20-second demo\nunder the headline",
      pageUrl: PAGE,
      autoDeploy: false,
    });
    const { path, title, body, labels } = parse(url);
    expect(path).toBe(`${REPO}/issues/new`);
    expect(title).toBe("Show a 20-second demo");
    expect(labels).toBe("idea");
    expect(body).toBe(
      [
        "Show a 20-second demo\nunder the headline",
        "",
        "---",
        `Page: ${PAGE}`,
        "Auto-deploy: no (review first)",
        "Filed from the Improve button on equin.ai",
      ].join("\n"),
    );
  });

  test("records the auto-deploy choice", () => {
    const { body } = parse(
      buildIssueUrl({
        repoUrl: REPO,
        text: "x",
        pageUrl: PAGE,
        autoDeploy: true,
      }),
    );
    expect(body).toContain("\nAuto-deploy: yes\n");
  });

  test("tolerates a trailing slash on the repo URL", () => {
    const url = buildIssueUrl({
      repoUrl: `${REPO}/`,
      text: "x",
      pageUrl: PAGE,
      autoDeploy: false,
    });
    expect(parse(url).path).toBe(`${REPO}/issues/new`);
  });

  test("encodes characters that would otherwise break the query", () => {
    const text = "a & b = c? #1 100% + more\nline two / \"quoted\" 'é' 🙂";
    const pageUrl = `${PAGE}?tab=a&x=1#section`;
    const url = buildIssueUrl({
      repoUrl: REPO,
      text,
      pageUrl,
      autoDeploy: false,
    });
    // One query string, no fragment: every reserved character in the text and
    // the page URL is escaped, so nothing ends a parameter early.
    expect(new URL(url).hash).toBe("");
    expect([...new URL(url).searchParams.keys()]).toEqual([
      "title",
      "body",
      "labels",
    ]);
    const { title, body } = parse(url);
    expect(title).toBe("a & b = c? #1 100% + more");
    expect(body.startsWith(`${text}\n\n---\nPage: ${pageUrl}\n`)).toBe(true);
  });

  test("stays under the cap for very long text, keeping the footer whole", () => {
    const text = `First line\n${"lorem ipsum dolor ".repeat(2_000)}`;
    const url = buildIssueUrl({
      repoUrl: REPO,
      text,
      pageUrl: PAGE,
      autoDeploy: true,
    });
    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    const { title, body } = parse(url);
    expect(title).toBe("First line");
    const [kept] = body.split("\n\n---\n");
    expect(kept?.endsWith("…")).toBe(true);
    expect(text.startsWith(kept!.slice(0, -1))).toBe(true);
    expect(body).toContain(`Page: ${PAGE}`);
    expect(body).toContain("Auto-deploy: yes");
    // Tight, not merely under: one more character would not have fitted.
    expect(url.length).toBeGreaterThan(MAX_ISSUE_URL_LENGTH - 20);
  });

  test("measures the cap in encoded characters, not typed ones", () => {
    // Each emoji encodes to twelve characters, so a text far shorter than the
    // cap in characters is still far over it once encoded.
    const text = "🙂".repeat(1_500);
    const url = buildIssueUrl({
      repoUrl: REPO,
      text,
      pageUrl: PAGE,
      autoDeploy: false,
    });
    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    expect(parse(url).body).not.toContain("�");
  });

  test("throws when the page URL alone is over the cap", () => {
    expect(() =>
      buildIssueUrl({
        repoUrl: REPO,
        text: "x".repeat(10_000),
        pageUrl: `${PAGE}?q=${"z".repeat(MAX_ISSUE_URL_LENGTH)}`,
        autoDeploy: false,
      }),
    ).toThrow(/no text at all/);
  });
});
