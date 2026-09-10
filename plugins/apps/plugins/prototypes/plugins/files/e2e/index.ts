/**
 * e2e barrel for the prototypes file tree.
 *
 * Importable from other plugins' e2e scripts as
 * `@plugins/apps/plugins/prototypes/plugins/files/e2e`, so a script can make
 * "an agent edited this prototype" happen without knowing where the tree lives
 * — that is this plugin's declaration (`data-dirs/`), not the script's.
 */
export { touchPrototype } from "./touch";
