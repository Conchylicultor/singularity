import { useEffect, useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { BlockEditor } from "@plugins/page/plugins/editor/web";
import { ensureDebugDocument } from "../../core";

export function PageDebugPanel() {
  const [documentId, setDocumentId] = useState<string | null>(null);

  useEffect(() => {
    // Idempotent server-side get-or-create — safe to fire once per tab mount.
    void (async () => {
      const doc = await fetchEndpoint(ensureDebugDocument, {});
      setDocumentId(doc.id);
    })();
  }, []);

  if (!documentId) {
    return <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div>;
  }

  return <BlockEditor documentId={documentId} />;
}
