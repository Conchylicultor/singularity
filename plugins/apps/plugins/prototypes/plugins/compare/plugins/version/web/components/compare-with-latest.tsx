import { MdCompare } from "react-icons/md";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  prototypeHistoryResource,
  type PrototypeVersion,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  useCloseVersionList,
  usePrototypeDetail,
} from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { useCompareAgainst } from "@plugins/apps/plugins/prototypes/plugins/compare/web";

/**
 * The version list's hover action: show this version beside the latest one.
 *
 * Shows the row's version (so the stepper and the past-version pill say which
 * one it is, and ‹ › keep stepping the left half through history), compares it
 * against `version:latest`, switches to the Compare stage and closes the list.
 * Nothing on the row that IS the latest — it would be compared with itself.
 */
export function CompareWithLatest({ row }: ItemActionProps<PrototypeVersion>) {
  const { name, showVersion } = usePrototypeDetail();
  const { compareAgainst } = useCompareAgainst();
  const close = useCloseVersionList();
  const history = useResource(prototypeHistoryResource, { name });
  return matchResource(history, {
    pending: () => null,
    error: () => null,
    ready: (h) => {
      const isLatest = !h.dirty && h.versions.at(-1)?.sha === row.sha;
      if (isLatest) return null;
      return (
        <IconButton
          icon={MdCompare}
          label="Compare with latest"
          onClick={() => {
            showVersion(row);
            compareAgainst({ tag: "version", ref: "latest" });
            close();
          }}
        />
      );
    },
  });
}
