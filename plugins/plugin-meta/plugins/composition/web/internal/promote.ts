import { useCallback } from "react";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { useStageConfigDefault } from "@plugins/config_v2/plugins/staging/web";
import { compositionsConfig } from "@plugins/plugin-meta/plugins/composition/core";
import { useManifestItems } from "./manifests";

/**
 * The dot-form plugin id the `compositions` config is registered under (the
 * composition plugin itself, `plugin-meta.composition`). Derived from the live
 * config_v2 registrations by descriptor reference identity rather than
 * hardcoded, so the staged storePath
 * (`config/<asPath(pluginId)>/compositions.jsonc`) always matches whatever the
 * `ConfigV2.WebRegister` contribution resolves to.
 */
function useCompositionsPluginId(): string | undefined {
  const registrations = useConfigRegistrations();
  return registrations.find((r) => r.descriptor === compositionsConfig)?.pluginId;
}

export interface PromoteManifestsToGit {
  /**
   * Stage the current manifest set as a committed git-layer "default for
   * everyone". Surfaces in the review pane's generic "Default for everyone"
   * section, where it can be applied (landed on `main`) or discarded.
   */
  promote(): void;
  /** False until the config registration is resolved (button stays disabled). */
  ready: boolean;
}

/**
 * Promote the current `compositions` manifest set to a committed git-layer
 * default via the generic config_v2 staging primitive. The staged value is the
 * FULL config document (`{ manifests: <raw items> }`) — byte-compatible with
 * what `useManifestActions().save` writes through `setConfig("manifests", …)`,
 * so the land-step `descriptor.schema.safeParse(value)` validates cleanly.
 *
 * This is the single owner of config_v2/staging access for compositions; the
 * Studio pane goes through this hook (collection-consumer separation) and never
 * imports the staging barrel directly.
 */
export function usePromoteManifestsToGit(): PromoteManifestsToGit {
  const items = useManifestItems();
  const pluginId = useCompositionsPluginId();
  const stage = useStageConfigDefault();

  const promote = useCallback(() => {
    if (!pluginId) {
      throw new Error(
        "compositions config not registered: cannot resolve its config_v2 storePath for git promotion",
      );
    }
    stage.mutate({
      body: {
        pluginId,
        configName: compositionsConfig.name,
        value: { manifests: items },
      },
    });
  }, [pluginId, items, stage]);

  return { promote, ready: pluginId !== undefined && !stage.isPending };
}
