import { useEffect, useState } from "react";
import { ReconnectingEventSource } from "@core";
import type { EditedFile, EditedFilesResponse } from "../shared/protocol";

const cache = new Map<string, EditedFile[]>();

export function useEditedFiles(conversationId: string): {
  files: EditedFile[] | null;
} {
  const [files, setFiles] = useState<EditedFile[] | null>(
    () => cache.get(conversationId) ?? null,
  );

  useEffect(() => {
    setFiles(cache.get(conversationId) ?? null);
    const es = new ReconnectingEventSource({
      url: `/api/conversations/${conversationId}/edited-files/stream`,
      onMessage: (data) => {
        try {
          const body = JSON.parse(data) as EditedFilesResponse;
          cache.set(conversationId, body.files);
          setFiles(body.files);
        } catch {
          // ignore malformed frame
        }
      },
    });
    return () => es.close();
  }, [conversationId]);

  return { files };
}
