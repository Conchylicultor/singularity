export async function upsertNote(
  conversationId: string,
  notes: string,
): Promise<void> {
  const res = await fetch(
    `/api/conversation-notes/${encodeURIComponent(conversationId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

export async function deleteNote(conversationId: string): Promise<void> {
  const res = await fetch(
    `/api/conversation-notes/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}
