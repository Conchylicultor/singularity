export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
}

// List attachments for a given owner. Each owning plugin exposes its own
// `GET /api/<ownerType>s/:id/attachments` that joins through its own
// `<owner>_attachments` link table — attachments plugin stays polymorphism-
// free on the server side.
export async function listAttachments(ownerType: string, ownerId: string): Promise<Attachment[]> {
  const res = await fetch(`/api/${ownerType}s/${encodeURIComponent(ownerId)}/attachments`);
  if (!res.ok) throw new Error(`listAttachments failed (${res.status})`);
  return res.json() as Promise<Attachment[]>;
}
