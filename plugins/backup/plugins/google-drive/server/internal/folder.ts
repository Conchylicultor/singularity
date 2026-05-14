const FOLDER_NAME = "Singularity Backups";
const FOLDER_MIME = "application/vnd.google-apps.folder";

let cachedFolderId: string | null = null;

export async function ensureFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    )}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!searchRes.ok) {
    throw new Error(`Drive folder search: ${searchRes.status}`);
  }
  const { files } = (await searchRes.json()) as {
    files: { id: string }[];
  };

  if (files.length > 0) {
    cachedFolderId = files[0]!.id;
    return cachedFolderId;
  }

  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: FOLDER_MIME,
      }),
    },
  );
  if (!createRes.ok) {
    throw new Error(`Drive folder create: ${createRes.status}`);
  }
  const created = (await createRes.json()) as { id: string };
  cachedFolderId = created.id;
  return cachedFolderId;
}
