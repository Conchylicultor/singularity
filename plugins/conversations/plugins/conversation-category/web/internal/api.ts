export async function setCategory(
  conversationId: string,
  category: string,
): Promise<void> {
  const res = await fetch(
    `/api/conversation-category/${encodeURIComponent(conversationId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string })?.error ?? `HTTP ${res.status}`,
    );
  }
}

export async function reclassify(conversationId: string): Promise<void> {
  const res = await fetch(
    `/api/conversation-category/${encodeURIComponent(conversationId)}/classify`,
    { method: "POST" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string })?.error ?? `HTTP ${res.status}`,
    );
  }
}
