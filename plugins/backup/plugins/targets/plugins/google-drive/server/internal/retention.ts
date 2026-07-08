export interface PruneResult {
  pruned: number;
  /** One entry per file whose DELETE failed, identifying the file + error. */
  failures: string[];
}

export async function pruneOldBackups(
  folderId: string,
  keepLast: number,
  accessToken: string,
): Promise<PruneResult> {
  if (keepLast <= 0) return { pruned: 0, failures: [] };

  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${folderId}' in parents and trashed=false`,
    )}&orderBy=createdTime&fields=files(id,name,createdTime)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  // A failed list is not a partial result — the whole retention pass failed,
  // so nothing distinguishes it from "nothing to prune". Throw loudly.
  if (!listRes.ok) {
    throw new Error(
      `Drive files.list failed for retention: ${listRes.status} ${listRes.statusText}`,
    );
  }

  const { files } = (await listRes.json()) as {
    files: { id: string; name: string; createdTime: string }[];
  };

  if (files.length <= keepLast) return { pruned: 0, failures: [] };

  const toDelete = files.slice(0, files.length - keepLast);
  let pruned = 0;
  const failures: string[] = [];
  for (const file of toDelete) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (res.ok) {
      pruned++;
    } else {
      failures.push(`${file.name} (${file.id}): ${res.status} ${res.statusText}`);
    }
  }
  return { pruned, failures };
}
