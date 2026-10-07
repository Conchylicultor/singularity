import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";

export const depsUpdatesConfig = defineConfig({
  fields: {
    detectCron: textField({
      default: "0 6 * * 1",
      label: "Dependency upgrade check (cron)",
      description:
        "5-field crontab (m h dom mon dow, UTC) for the Dependency upgrades automation, which files ONE task upgrading every outdated dependency. Default weekly, Mondays 06:00 UTC. Empty = never (run `./singularity deps upgrade` by hand). Takes effect on the next server restart.",
    }),
  },
});
