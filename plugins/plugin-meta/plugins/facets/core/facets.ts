import type { SlotNaming } from "@plugins/framework/plugins/slot-declaration/core";
import type { FsSnapshot } from "@plugins/plugin-meta/plugins/parse-utils/core";

export interface FacetDef<T> {
  id: string;
  _phantom?: T;
}

export interface ExtractContext {
  dir: string;
  /**
   * The plugin this extraction describes, as its dotted id.
   *
   * A facet describing SOURCE (what a plugin declares) can need a slot's id
   * without the runtime having stamped one — a disabled plugin's barrel is still
   * read here, and its slots are never declared. `${pluginId}.${key}` is the id
   * either way, so the facet derives it rather than depending on a stamp.
   */
  pluginId: string;
  /**
   * The barrels imported for this plugin, PAIRED with the naming the declaration
   * pass over those same barrels settled. Populated by `buildPluginTree` unless
   * `skipBarrelImport` is set; absent for facets that only need static files.
   *
   * ONE FIELD, NOT TWO, and that is the whole point — do not flatten it back into
   * `modules?` beside `naming?`. Importing a barrel is what brings a plugin's
   * `contributions` into existence; running a declaration pass is what gives the
   * slots those contributions target their names. A reader holding the first
   * without the second gets an answer that is smaller than the truth and shaped
   * exactly like a correct one: every id reads as absent, so a whole plugin's
   * contributions silently vanish. That is not hypothetical — it is how a
   * `docs/plugins-details.md` missing reorder's entire `Contributes:` block got
   * committed, and how it made `main` un-pushable four commits later. A runtime
   * assert used to catch it here; pairing the two makes the state unspellable
   * instead, so there is nothing left to assert.
   */
  imported?: {
    modules: {
      mod: Record<string, unknown>;
      runtime: "web" | "server" | "central";
    }[];
    naming: SlotNaming;
  };
  // Build-scoped, read-once in-memory FS snapshot in effect for this extraction.
  // When present, the parse-utils `readIfExists` / `walkFiles` helpers read from
  // it instead of disk (wired ambiently by buildPluginTree's extract loop), so
  // facet bodies need no change. Absent for build-time callers that scan disk
  // directly. Facets read files via the parse-utils helpers, not this field.
  fs?: FsSnapshot;
}

export interface DocFact {
  folder: string;
  key: string;
  values: string[];
}

export interface RenderDocContext {
  root: string;
}

export interface Facet {
  def: FacetDef<unknown>;
  extract: (ctx: ExtractContext) => unknown;
  relate?: (ctx: unknown) => void;
  renderDoc: (data: unknown, ctx: RenderDocContext) => DocFact[];
}

export function defineFacet<T>(id: string): FacetDef<T> {
  return { id };
}

export function createFacet<T>(impl: {
  def: FacetDef<T>;
  extract: (ctx: ExtractContext) => T;
  relate?: (ctx: unknown) => void;
  renderDoc: (data: T, ctx: RenderDocContext) => DocFact[];
}): Facet {
  return impl as Facet;
}

export function getFacet<T>(
  node: { facets: Record<string, unknown> },
  def: FacetDef<T>,
): T | undefined {
  return node.facets[def.id] as T | undefined;
}

export function setFacet<T>(
  node: { facets: Record<string, unknown> },
  def: FacetDef<T>,
  data: T,
): void {
  node.facets[def.id] = data;
}
