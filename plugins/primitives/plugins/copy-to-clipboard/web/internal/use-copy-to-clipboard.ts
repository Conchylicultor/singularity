import { useState, useCallback } from "react";

export function useCopyToClipboard(
  text: string,
  delay = 1500,
): { copy: () => void; copied: boolean } {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), delay);
    });
  }, [text, delay]);
  return { copy, copied };
}
