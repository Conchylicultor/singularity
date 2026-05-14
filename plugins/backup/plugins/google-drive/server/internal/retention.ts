export async function pruneOldBackups(
  folderId: string,
  keepLast: number,
  accessToken: string,
): Promise<number> {
  if (keepLast <= 0) return 0;

  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${folderId}' in parents and trashed=false`,
    )}&orderBy=createdTime&fields=files(id,name,createdTime)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) return 0;

  const { files } = (await listRes.json()) as {
    files: { id: string; name: string; createdTime: string }[];
  };

  if (files.length <= keepLast) return 0;

  const toDelete = files.slice(0, files.length - keepLast);
  let deleted = 0;
  for (const file of toDelete) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (res.ok) deleted++;
  }
  return deleted;
}
