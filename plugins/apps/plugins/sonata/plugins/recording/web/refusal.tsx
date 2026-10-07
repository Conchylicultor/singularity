import { createContext, useContext, type ReactNode } from "react";
import type { EmbedStatus } from "@plugins/integrations/plugins/youtube/core";

/** YouTube refused to play the score's recording here. */
export interface MediaRefusal {
  provider: "youtube";
  videoId: string;
  /** What the refusal says about the video: removed, or not playable in an embed. */
  status: Exclude<EmbedStatus, "ok">;
  /** The IFrame API's error code. */
  code: number;
}

const RefusalContext = createContext<MediaRefusal | null>(null);

export function RefusalProvider({
  refusal,
  children,
}: {
  refusal: MediaRefusal;
  children: ReactNode;
}) {
  return (
    <RefusalContext.Provider value={refusal}>
      {children}
    </RefusalContext.Provider>
  );
}

/**
 * The refusal a `SonataRecording.Refused` contribution was mounted for. Throws
 * anywhere else: there is no refusal to read outside that slot.
 */
export function useMediaRefusal(): MediaRefusal {
  const refusal = useContext(RefusalContext);
  if (refusal === null) {
    throw new Error(
      "useMediaRefusal must be called by a SonataRecording.Refused contribution",
    );
  }
  return refusal;
}
