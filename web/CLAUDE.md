# Web

Single-page application (SPA). No SSR, no SEO concerns.

## Stack

- **Vite** — Build tool and dev server
- **React 19** + **TypeScript**
- **Tailwind CSS v4** — Styling (via `@tailwindcss/vite` plugin)
- **shadcn/ui** — UI components (Radix-based, copy-pasted into `src/components/ui/`)
- **Lucide** — Icons

## Structure

- `src/` — Application source
  - `components/ui/` — shadcn/ui components (generated, do not edit manually)
  - `components/` — App-level components
  - `lib/` — Utilities
- `@` path alias resolves to `src/`

## Commands

Always go through `./singularity build` from the repo root — it runs `bun run build` here as part of the deploy. `bun run test` for vitest.
