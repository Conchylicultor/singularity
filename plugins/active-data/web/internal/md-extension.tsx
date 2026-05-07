import type { ReactNode } from "react";
import type { CodeHandler } from "@plugins/primitives/plugins/markdown/web";
import { useActiveDataLinkify } from "./linkify-active-data";

export function useActiveDataTransform(): ((children: ReactNode) => ReactNode) | null {
  return useActiveDataLinkify();
}

export function useActiveDataCodeHandler(): CodeHandler | null {
  const linkify = useActiveDataLinkify();
  return {
    inline: (text) => {
      const result = linkify(text);
      return result !== text ? <>{result}</> : null;
    },
  };
}
