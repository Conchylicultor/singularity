# Eliminate the flat-form path to keyed live-state resources

## Context

`defineResource` (the shared live-state runtime) accepts two call shapes:

- **Flat one-arg:** `defineResource({ key, schema, mode, keyOf, loader, ... })`
- **Two-arg descriptor:** `defineResource(descriptor, serverOpts)` — derives
  `key` / `schema` / keyed-ness from a client-shared `ResourceDescriptor`, so
  server and client cannot disagree.

A keyed resource (`mode: "keyed"`, row-level delta sync) only works if the
**client** also declares the same `keyOf` (via `keyedResourceDescriptor`). When
the server is keyed but the client used a plain `resourceDescriptor`, the browser
crashes at the first row delta with `"no keyOf registered for keyed resource"` —
**no compile-time and no check-time signal**. This is the class that caused the
recent agent-launches crash.

The two-arg form already removes this drift (keyed-ness comes from one shared
descriptor). But the **flat form still permits `mode: "keyed"`** (the second
member of the `DefineResourceInput` union), so a keyed server resource can still
be authored with an inline `keyOf` that has no matching client descriptor. There
are **0 production flat-keyed call sites** today — all three keyed resources
(`tasks`, `attempts`, `agent-launches`) already use the two-arg form — but the
type still allows the broken shape.

**Goal:** make keyed-ness reachable *only* through a shared descriptor. Close
both the flat-keyed path and the weaker "inline keyed contract literal" path, so
the silent-crash class is structurally impossible — type as primary enforcement,
a `./singularity check` as the backstop (mirroring the existing
`keyed-resource-scope` pattern).

## Approach

Two coordinated changes — a **type narrowing** (primary) and a **repurposed
check** (backstop) — plus doc updates. No nominal brand (see Considered
alternatives).

### 1. Type: remove the keyed branch from the flat form

File: `plugins/framework/plugins/resource-runtime/core/runtime.ts`

`DefineResourceInput` (lines 203–212) is a two-member union. Delete the keyed
member, collapsing it to a single shape:

```ts
// AFTER
export type DefineResourceInput<T, P extends ResourceParams = ResourceParams> =
  Omit<ResourceDefinition<T, P>, "mode" | "keyOf" | "identityTable" | "recompute"> & {
    mode?: "push" | "invalidate";
    identityTable?: string;
  };
```

Effect: the flat one-arg form keeps everything it has today
(`key`/`schema`/`loader`/`dependsOn`/`debounceMs`/lifecycle hooks/`mode?:
"push"|"invalidate"`/`identityTable?`) and **loses only** `mode: "keyed"`,
`keyOf`, and `recompute` (the keyed FULL opt-out, meaningless without keyed).
`mode: "keyed"` is now reachable *only* via the two-arg `KeyedResourceContract`
overload (overload 2), which already forces a `ScopePolicy`.

Also tighten the **non-keyed two-arg overload (overload 3)** so a contract passed
there is explicitly non-keyed — `contract: ResourceContract<T, P> & { keyed?: never }`
(lines 507–510). This makes "non-keyed descriptor" unambiguous and routes any
stray inline `{ ..., keyed: {...} }` literal to the keyed overload (ScopePolicy
forced) instead of silently through the plain one. `resourceDescriptor(...)`
already returns `& { keyed?: never }`, so all 4 non-keyed two-arg sites still
match; `keyedResourceDescriptor(...)` returns `& { keyed: {...} }` and matches
overload 2 as before.

Update the `DefineResourceInput` doc comment (lines 195–202) and the
`ResourceRuntime.defineResource` overload doc (lines 486–500) to state the flat
form is push/invalidate-only and keyed must use the two-arg descriptor form.

The implementation signature, `contractToDefinition`, and `createResource`
(including its runtime `mode === "keyed" && !keyOf` guard at line 794) are
**unchanged** — the internal `ResourceDefinition` stays loose, so the runtime
keeps its defensive backstop and the runtime tests keep constructing edge-case
keyed shapes via the raw API.

### 2. Check: repurpose `keyed-resource-scope` to ban flat/inline keyed

File: `plugins/framework/plugins/tooling/plugins/checks/plugins/keyed-resource-scope/check/index.ts`

After the type change, `ScopePolicy` is fully type-enforced on **both** remaining
paths (flat can't be keyed; two-arg keyed forces ScopePolicy). So the check's old
job ("keyed without scope policy") is now redundant at the type level. Repurpose
it to guard the *new* structural invariant — keyed-ness must come from a shared
descriptor — catching type bypasses (`as any`, `// @ts-expect-error`) and inline
contracts. The check flags a `defineResource(...)` span when **either**:

1. **Flat keyed bypass** — `parseStringField(block, "mode") === "keyed"`. (The
   sanctioned two-arg keyed form never writes `mode:` textually — it comes from
   the descriptor — so any literal `mode: "keyed"` is a flat-form bypass.) This
   is the existing scan minus the `identityTable`/`recompute` exemption (drop
   lines 53–54, 74): the field's presence is now the violation, not its absence.

2. **Inline keyed contract** — the call's **first argument is an object literal**
   (`{`…) containing a top-level `keyed:` field. The sanctioned two-arg form
   passes an *imported descriptor identifier*, so `keyed:` never appears in a
   real call; an inline `{ key, schema, keyed: { keyOf } }` literal is the only
   way it shows up. Detect via the existing `markerCallSpans` walk plus a
   brace-depth scan of the first argument (depth-1 `keyed:` only — so a
   `loader`'s nested data object can't false-positive).

Update `id` stays `keyed-resource-scope` (minimal churn; still concerns keyed
declaration correctness), but rewrite `description` + `hint` to: "A keyed
resource must be declared via `keyedResourceDescriptor(...)` and the two-arg
`defineResource(descriptor, opts)` form. The flat `mode: "keyed"` form and inline
`keyed:` contract literals are forbidden — both let server keyed-ness drift from
the client and crash the browser with no compile-time signal." Keep the existing
test-path exclusion (lines 49–50) so `runtime.test.ts`'s deliberate edge-case
shapes are not flagged.

### 3. Docs

- `plugins/primitives/plugins/live-state/CLAUDE.md` — rewrite the parenthetical
  at lines ~133–136 ("flat one-arg keyed form still exists"): the flat form is
  push/invalidate-only; keyed **must** use `keyedResourceDescriptor` + two-arg
  form (the flat form structurally cannot be keyed; inline contracts are
  check-banned).
- `plugins/framework/plugins/server-core/CLAUDE.md` — adjust the "flat one-arg
  form stays for resources with no shared descriptor" sentence to add: keyed
  resources cannot use the flat form.
- `plugins/framework/plugins/resource-runtime/CLAUDE.md` — autogen block is
  regenerated by `./singularity build`; no hand edit needed.

## Migration impact

- **Production:** zero flat-keyed call sites; all keyed resources already use the
  two-arg form. No production code changes.
- **Tests:** the 4 flat-keyed calls in
  `plugins/framework/plugins/resource-runtime/core/runtime.test.ts` use the raw
  `createResourceRuntime().defineResource` and are **excluded from type-checking**
  (`server-core/tsconfig.json` excludes `**/*.test.ts`) and run under bun (no
  type enforcement); the loose implementation signature still accepts them. They
  keep passing unchanged, and the check skips test paths. No test migration.

## Considered alternatives

- **Nominal brand** (a `unique symbol` on `KeyedResourceContract`, claimed by
  `keyedResourceDescriptor`) to make the two-arg keyed overload reject inline
  literals at the type level. **Rejected:** it forces a
  `live-state/core → resource-runtime/core` import to share the brand symbol,
  which defeats the deliberate client/server bundle decoupling — the runtime
  matches `ResourceContract` *structurally* precisely so neither side imports the
  other. The check (#2) closes the same inline-contract vector textually with no
  coupling and no bundle cost, consistent with the codebase's "type primary +
  check backstop" pattern.

## Critical files

- `plugins/framework/plugins/resource-runtime/core/runtime.ts` — `DefineResourceInput` (203–212), overloads (486–511), doc comments.
- `plugins/framework/plugins/resource-runtime/core/index.ts` — re-exports `DefineResourceInput` (no change needed; type shape changes transparently).
- `plugins/primitives/plugins/live-state/core/resource.ts` — `keyedResourceDescriptor` / `resourceDescriptor` (reference only; unchanged).
- `plugins/framework/plugins/tooling/plugins/checks/plugins/keyed-resource-scope/check/index.ts` — repurpose.
- `plugins/primitives/plugins/live-state/CLAUDE.md`, `plugins/framework/plugins/server-core/CLAUDE.md` — prose.

## Verification

1. `./singularity build` — regenerates docs/registry, type-checks, runs checks.
2. **Type narrowing works:** temporarily add a flat `defineResource({ key, schema, mode: "keyed", keyOf, loader, identityTable })` in a non-test server file → expect a `tsc` error (no matching overload). Remove it.
3. **Check catches bypasses:** temporarily add (a) a flat `mode: "keyed"` cast with `as any`, and (b) a two-arg `defineResource({ key, schema, keyed: { keyOf } }, { loader, identityTable })` inline literal → run `./singularity check keyed-resource-scope` → both flagged. Remove.
4. **No regressions:** `./singularity check` passes clean; `bun test plugins/framework/plugins/resource-runtime/core/runtime.test.ts` passes (the 4 flat-keyed edge-case tests still run).
5. **Runtime sanity:** app boots at `http://<worktree>.localhost:9000`; the keyed resources (tasks / attempts / agent-launches) live-update without the `no keyOf registered` crash.
