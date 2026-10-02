import type { IconifyJSON } from "@iconify/types";
import { setiIdentity } from "../../shared";
import { loadSetiJson } from "./seti-file";

/**
 * The vendored Seti file-type set, as the sprite server builds it: `version`
 * is what a sprite drawn from it is a function of (the pinned source commit and
 * the normalizer).
 */
export const SETI_SET: { readonly name: string; readonly version: string } = {
  name: "seti-ui",
  version: setiIdentity(),
};

export function readSetiSet(): Promise<IconifyJSON> {
  return loadSetiJson();
}
