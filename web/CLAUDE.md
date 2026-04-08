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

```sh
bun dev      # Start dev server
bun build    # Type-check + build
bun preview  # Preview production build
```
