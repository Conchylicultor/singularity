import { defineCliCommand } from "@plugins/framework/plugins/cli/core";

/**
 * `prototype` is a GROUP: it routes and never runs. The declaration union makes
 * that exclusive — a group carries `subcommands` and cannot also carry `run` —
 * so `./singularity prototype` printing its own help is a property of the shape
 * rather than a runtime check.
 *
 * Both leaves work straight against the filesystem, never over HTTP, and that
 * is the whole point of having them: the prototypes tree is host-global and
 * outside every checkout, so an agent can mint and enumerate mocks with no
 * backend running and nothing built.
 *
 * This file is reached on EVERY `./singularity` invocation (commander needs the
 * names and flags before it can parse argv), so it imports `defineCliCommand`
 * and nothing else; `mintPrototype` and the lister sit behind the dynamic
 * `run: () => import(…)`. `cli:command-declarations-light` measures that
 * closure. The generics are pinned so this declaration is checked against each
 * implementation's default export — see `cli/core/internal/command.ts`.
 */
export default defineCliCommand({
  name: "prototype",
  description: "Throwaway UI prototype operations",
  subcommands: [
    defineCliCommand<[string | undefined], object>({
      name: "new",
      description:
        "Mint a prototype: create a freshly id'd folder in the host-global " +
        "prototypes dir holding the blank template, and print its id, path and " +
        "URL. [title] stamps the copy's <title>, which is the name every " +
        "surface displays; omit it and the card reads 'Untitled prototype' " +
        "until you write one. Needs no running backend.",
      arguments: [
        {
          name: "[title]",
          description: "display name to stamp into the prototype's <title>",
        },
      ],
      run: () => import("./new"),
    }),
    defineCliCommand<[], object>({
      name: "list",
      description:
        "List every prototype — id, title and URL — read straight off the " +
        "host-global prototypes dir. Needs no running backend.",
      run: () => import("./list"),
    }),
  ],
});
