import {
  getEndpointErrorMessage,
  useEndpoint,
} from "@plugins/infra/plugins/endpoints/web";
import { hostFsVolume } from "@plugins/infra/plugins/host-fs/core";
import { useHomeDir } from "@plugins/apps/plugins/file-explorer/plugins/browser/web";
import { displayPath } from "@plugins/apps/plugins/file-explorer/plugins/browser/core";
import {
  FileExplorer,
  type PlaceState,
} from "@plugins/apps/plugins/file-explorer/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { fileExplorerCheckout } from "../../core";

/** A place that is the same everywhere: a fixed label and path. */
function fixedPlace(label: string, path: string): () => PlaceState {
  const state: PlaceState = { kind: "ready", label, path };
  return function useFixedPlace() {
    return state;
  };
}

/** The Singularity main checkout — its path is the server's to say. */
function useSingularityPlace(): PlaceState {
  const checkout = useEndpoint(fileExplorerCheckout, {});
  const home = useHomeDir();
  const label = "Singularity";
  if (checkout.isError) {
    return {
      kind: "failed",
      label,
      message: getEndpointErrorMessage(checkout.error),
    };
  }
  if (!checkout.data || home.kind === "pending") return { kind: "pending" };
  return {
    kind: "ready",
    label,
    path:
      home.kind === "ready"
        ? displayPath(checkout.data.path, home.home)
        : checkout.data.path,
  };
}

/** The startup volume, named as the system names it ("Macintosh HD"). */
function useStartupVolumePlace(): PlaceState {
  const volume = useEndpoint(hostFsVolume, {}, { query: { path: "/" } });
  if (volume.isError) {
    return {
      kind: "failed",
      label: "/",
      message: getEndpointErrorMessage(volume.error),
    };
  }
  if (!volume.data) return { kind: "pending" };
  if (volume.data.kind !== "ok") {
    return { kind: "failed", label: "/", message: `/ is ${volume.data.kind}` };
  }
  return { kind: "ready", label: volume.data.name, path: "/" };
}

/** The places this plugin contributes, in sidebar order within each group. */
export const placeContributions = [
  FileExplorer.Place({
    id: "home",
    group: "favorites",
    icon: symbol("home"),
    usePlace: fixedPlace("Home", "~"),
  }),
  FileExplorer.Place({
    id: "downloads",
    group: "favorites",
    icon: symbol("download"),
    usePlace: fixedPlace("Downloads", "~/Downloads"),
  }),
  FileExplorer.Place({
    id: "singularity",
    group: "favorites",
    icon: symbol("folder"),
    usePlace: useSingularityPlace,
  }),
  FileExplorer.Place({
    id: "startup-volume",
    group: "locations",
    icon: symbol("hard-drive"),
    usePlace: useStartupVolumePlace,
  }),
  // Without Full Disk Access the Trash cannot be listed; the browser says so
  // (a denied folder) rather than showing it empty.
  FileExplorer.Place({
    id: "trash",
    group: "locations",
    icon: symbol("delete"),
    usePlace: fixedPlace("Trash", "~/.Trash"),
  }),
];
