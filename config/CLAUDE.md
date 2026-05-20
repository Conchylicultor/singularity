# config/

Git-committed config defaults and overrides. Structure mirrors `~/.singularity/config/` by plugin hierarchy.

## File layout

```
config/<plugin-tree>/
  <name>.origin.jsonc   # Auto-generated from defineConfig defaults — DO NOT edit
  <name>.jsonc          # Agent overrides (optional, hand-edited, committed)
```

Every file starts with `// @hash <12-hex>` on line 1.

## How to override defaults

1. Run `./singularity build` to generate/update `.origin.jsonc` files
2. Copy `<name>.origin.jsonc` → `<name>.jsonc`
3. Edit values in the copy. Keep the `// @hash` line — it must match the origin's hash.
4. Commit both files.

## When origin changes

If `defineConfig` defaults change, build regenerates `.origin.jsonc` with a new hash. The `config-origins-in-sync` check fails until you update the `// @hash` in your `.jsonc` override to match. Review the new origin, reconcile your overrides, update the hash.

## What happens downstream

On server start, `propagate()` copies the resolved config here (override if present, else origin) to `~/.singularity/config/` where users can further override via the UI. See `plugins/config_v2/CLAUDE.md` for the full three-layer model.
