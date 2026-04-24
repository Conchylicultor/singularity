export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
}

export async function listAttachments(ownerType: string, ownerId: string): Promise<Attachment[]> {
  const params = new URLSearchParams({ ownerType, ownerId });
  const res = await fetch(`/api/attachments?${params}`);
  if (!res.ok) throw new Error(`listAttachments failed (${res.status})`);
  return res.json() as Promise<Attachment[]>;
}
