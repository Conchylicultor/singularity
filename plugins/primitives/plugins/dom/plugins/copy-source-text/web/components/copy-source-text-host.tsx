import { useEffect } from "react";
import { installCopySourceText } from "../internal/install-copy-source-text";

/**
 * Invisible global controller. Mounted once via `Core.Root`, it installs the
 * document `copy` handler for the lifetime of the app and renders nothing.
 */
export function CopySourceTextHost(): null {
  useEffect(() => installCopySourceText(), []);
  return null;
}
