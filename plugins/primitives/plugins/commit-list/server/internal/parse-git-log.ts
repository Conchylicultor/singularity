import type { CommitRow } from "../../core";

// %x09 = tab between fields; %x00 = NUL between records. Subjects are emitted
// last so any literal tabs in the subject don't shift later fields.
export const LOG_FORMAT = "%H%x09%h%x09%P%x09%an%x09%ae%x09%aI%x09%s%x00";

export function parseGitLog(out: string): CommitRow[] {
  const rows: CommitRow[] = [];
  for (const raw of out.split("\0")) {
    const line = raw.replace(/^\n/, "");
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 7) continue;
    const [sha, shortSha, parentsStr, authorName, authorEmail, authoredAt, ...rest] =
      parts as [string, string, string, string, string, string, ...string[]];
    // Subject can contain tabs — rejoin any extra fields beyond the 7th.
    const subject = rest.join("\t");
    const parents =
      parentsStr.length > 0 ? parentsStr.split(" ").filter(Boolean) : [];
    rows.push({
      sha,
      shortSha,
      subject,
      authorName,
      authorEmail,
      authoredAt,
      parents,
    });
  }
  return rows;
}
