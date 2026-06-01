# Web

Single-page application (SPA). No SSR, no SEO concerns.

## Stack

- **Vite** — Build tool and dev server
- **React 19** + **TypeScript**
- **Tailwind CSS v4** — Styling (via `@tailwindcss/vite` plugin)
- **shadcn/ui** — UI components (base-ui based, copy-pasted into `web/components/ui/`)
- **react-icons** — Icons (predominantly `react-icons/md`; not Lucide despite shadcn defaults)

## Structure

- `web/` — Application source
  - `components/ui/` — shadcn/ui components (generated, do not edit manually)
  - `components/` — App-level components
  - `lib/` — Utilities
- `@` path alias resolves to `web/`

## Commands

Always go through `./singularity build` from the repo root — it runs `bun run build` here as part of the deploy. `bun run test` for vitest.
