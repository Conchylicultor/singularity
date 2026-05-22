# Config V2: Conflict Resolution UI

## Context

config_v2's three-layer model (code → git → user) uses `// @hash <12hex>` headers to detect stale overrides. When upstream defaults change (new build propagates a new `.origin.jsonc`), user overrides with a mismatched hash are "conflicted." Today this only logs `console.warn` — invisible to the user. This plan wires conflict state from server to UI with per-field inline resolution.

Design choice: even when hash diverges but all field values happen to match origin (e.g. a field was added/removed), show a **soft banner** with explicit "Dismiss" rather than auto-acknowledging — keeping things visible while the system is experimental.

---

## Architecture

### Separate resource (not extending configV2Resource)

`useConfig` does `result.data as ConfigValues<F>` — 10+ plugins depend on this flat property bag. A separate `config-v2.conflicts` resource carries conflict state independently:

```ts
// schema: z.record(z.object({ originValues: z.record(z.unknown()) }))
// {} = no conflicts, { "build/config.jsonc": { originValues: {...} } } = conflict
```

Single parameterless push-mode resource serves sidebar badge (key count) and detail pane (per-field comparison).

### Resolution actions

| Action | Implementation |
|---|---|
| Accept per field | `setConfigField(storePath, key, originValues[key])` — reuse existing endpoint |
| Accept all new defaults | New `deleteOverride` endpoint — unlinks the `.jsonc` override file |
| Keep my values / Dismiss | New `acknowledgeConflict` endpoint — re-stamps `@hash` with current origin hash |

---

## Implementation Steps

### 1. Core: conflict resource descriptor

**File:** `plugins/config_v2/core/internal/resource.ts`

Add alongside existing `configV2Resource`:

```ts
export const configV2ConflictEntrySchema = z.object({
  originValues: z.record(z.unknown()),
});
export const configV2ConflictsSchema = z.record(configV2ConflictEntrySchema);
export type ConfigV2Conflicts = z.infer<typeof configV2ConflictsSchema>;

export const configV2ConflictsResource = resourceDescriptor<ConfigV2Conflicts>(
  "config-v2.conflicts",
  configV2ConflictsSchema,
  {},
);
```

**File:** `plugins/config_v2/core/index.ts` — export the new resource + types.

### 2. Server: conflict resource + loader

**File:** `plugins/config_v2/server/internal/resource.ts`

Add a `configV2ConflictsServerResource` using `defineResource`. The loader iterates `descriptorByPath`, calls `hasConflict()` for each, and returns the map with `originValues` for conflicted entries.

```ts
export const configV2ConflictsServerResource = defineResource<ConfigV2Conflicts>({
  key: "config-v2.conflicts",
  mode: "push",
  schema: configV2ConflictsSchema,
  loader: () => computeAllConflicts(),
});
```

`computeAllConflicts()` reconstructs `userOriginPath`/`userOverwritesPath` from `storePath` using `CONFIG_DIR` (same logic as `initRegistry`), instantiates `jsoncConfigProxy()` for each, and calls `hasConflict()`.

### 3. Server: notify conflicts on file change

**File:** `plugins/config_v2/server/internal/registry.ts`

In `onFileChange` (after existing `configV2ServerResource.notify({ path: storePath })`):

```ts
configV2ConflictsServerResource.notify();
```

### 4. Server: declare resource in plugin

**File:** `plugins/config_v2/server/index.ts`

Add to contributions:

```ts
contributions: [
  Resource.Declare(configV2ServerResource),
  Resource.Declare(configV2ConflictsServerResource),
],
```

### 5. New endpoints: acknowledgeConflict + deleteOverride

**File:** `plugins/config_v2/plugins/settings/core/internal/endpoints.ts`

```ts
export const acknowledgeConflict = defineEndpoint({
  route: "POST /api/config-v2/acknowledge-conflict",
  body: z.object({ storePath: z.string() }),
});

export const deleteOverride = defineEndpoint({
  route: "POST /api/config-v2/delete-override",
  body: z.object({ storePath: z.string() }),
});
```

**File:** `plugins/config_v2/plugins/settings/core/index.ts` — export both.

### 6. Server: endpoint handlers

**File:** `plugins/config_v2/server/internal/registry.ts`

Add two exported functions:

- `acknowledgeConflictByPath(storePath)`: reads override content, reads origin content, computes `computeHash(originData.content)`, rewrites override with same content + new hash via `jsoncConfigProxy.write()`.
- `deleteOverrideByPath(storePath)`: `unlinkSync` the override file (file watcher handles cache invalidation).

**File:** `plugins/config_v2/server/index.ts` — export both.

**File:** `plugins/config_v2/plugins/settings/server/internal/handlers.ts`

```ts
export const handleAcknowledgeConflict = implement(acknowledgeConflict, async ({ body }) => {
  acknowledgeConflictByPath(body.storePath);
});
export const handleDeleteOverride = implement(deleteOverride, async ({ body }) => {
  deleteOverrideByPath(body.storePath);
});
```

**File:** `plugins/config_v2/plugins/settings/server/index.ts` — register in `httpRoutes`.

### 7. Web: useConflicts hook

**New file:** `plugins/config_v2/plugins/settings/web/internal/use-conflicts.ts`

```ts
export function useConflicts(): ConfigV2Conflicts {
  const result = useResource(configV2ConflictsResource);
  if (result.pending) return {};
  return result.data;
}
```

### 8. Web: sidebar badge (ConfigSidebarButton)

**New file:** `plugins/config_v2/plugins/settings/web/components/config-sidebar-button.tsx`

Custom component that renders `SidebarMenuButton` + `MdTune` icon with an amber dot overlay (`absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500`) when `Object.keys(useConflicts()).length > 0`.

**File:** `plugins/config_v2/plugins/settings/web/index.ts`

Replace `...sidebarNavItem(...)` with direct `{ title: "Config", icon: MdTune, component: ConfigSidebarButton }`.

### 9. Web: nav row warning indicator

**File:** `plugins/config_v2/plugins/settings/web/components/config-nav-row.tsx`

Call `useConflicts()`. If `storePath in conflicts`, show `MdWarning` (amber) instead of the blue modified-count badge. Conflict takes visual priority.

### 10. Web: detail pane banner

**File:** `plugins/config_v2/plugins/settings/web/components/config-detail.tsx`

In `ConfigDetailInner`, consume `useConflicts()` and check `conflicts[storePath]`:

- **Soft banner** (hash diverged, all fields match origin): "Defaults updated — no conflicts" + [Dismiss] button
- **Full banner** (fields actually diverge): `MdWarning` "Upstream defaults changed" + [Accept all new defaults] [Keep my values]

Both Dismiss and Keep call `fetchEndpoint(acknowledgeConflict, ...)`. Accept all calls `fetchEndpoint(deleteOverride, ...)`.

### 11. Web: per-field conflict sub-row

**File:** `plugins/config_v2/plugins/settings/web/components/config-field-row.tsx`

Add optional `originValue` prop (passed from detail pane). When defined and differs from current value:

- Left stripe: `bg-amber-500` (overrides `bg-primary`)
- Sub-row below field: amber border/bg, shows "Upstream: {value}" + [Accept] button
- Accept calls `setConfigField(storePath, key, originValue)` — reuses existing endpoint

---

## Files Modified

| File | Change |
|---|---|
| `plugins/config_v2/core/internal/resource.ts` | Add conflict resource descriptor + types |
| `plugins/config_v2/core/index.ts` | Export new resource + types |
| `plugins/config_v2/server/internal/resource.ts` | Add `configV2ConflictsServerResource` + `computeAllConflicts()` |
| `plugins/config_v2/server/internal/registry.ts` | Add `notify()` in `onFileChange`, export `acknowledgeConflictByPath` + `deleteOverrideByPath` |
| `plugins/config_v2/server/index.ts` | Declare new resource, export new functions |
| `plugins/config_v2/plugins/settings/core/internal/endpoints.ts` | Add endpoint definitions |
| `plugins/config_v2/plugins/settings/core/index.ts` | Export new endpoints |
| `plugins/config_v2/plugins/settings/server/internal/handlers.ts` | Add handler implementations |
| `plugins/config_v2/plugins/settings/server/index.ts` | Register new routes |
| `plugins/config_v2/plugins/settings/web/index.ts` | Replace sidebarNavItem with custom component |
| `plugins/config_v2/plugins/settings/web/components/config-nav-row.tsx` | Add conflict warning indicator |
| `plugins/config_v2/plugins/settings/web/components/config-detail.tsx` | Add conflict banners |
| `plugins/config_v2/plugins/settings/web/components/config-field-row.tsx` | Add optional originValue prop + conflict sub-row |

## Files Created

| File | Purpose |
|---|---|
| `plugins/config_v2/plugins/settings/web/internal/use-conflicts.ts` | `useConflicts()` hook |
| `plugins/config_v2/plugins/settings/web/components/config-sidebar-button.tsx` | Custom sidebar button with badge |

---

## Verification

1. **Create a conflict state:** Manually edit a user `.origin.jsonc` in `~/.singularity/config/` to change a field value and its hash. Keep the `.jsonc` override file unchanged → hash mismatch = conflict.
2. **Verify sidebar badge:** The Config sidebar entry shows an amber dot.
3. **Verify nav row:** The conflicted config's row shows `MdWarning` instead of the modified-count badge.
4. **Verify full banner:** Open the conflicted config → amber banner with "Upstream defaults changed" + buttons.
5. **Verify per-field sub-rows:** Fields where user value ≠ origin value show amber sub-rows.
6. **Test "Accept" per field:** Click Accept on a field → value updates to origin value, sub-row disappears.
7. **Test "Accept all new defaults":** Click → override file deleted, all values revert, conflict clears.
8. **Test "Keep my values":** Click → hash re-stamped, conflict clears, values unchanged.
9. **Test soft banner:** Create a conflict where all field values happen to match origin → "Defaults updated — no conflicts" + [Dismiss].
10. **Test live update:** While viewing the detail pane, externally edit the origin file → conflict appears live without refresh (push-mode resource).
