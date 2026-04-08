# Plugin Styling Guide

Rules for consistent, professional-looking UI across all plugins. Every plugin must follow these rules — no exceptions.

## Foundational Rules

1. **Never hardcode colors.** Always use semantic Tailwind tokens (`bg-background`, `text-foreground`, `border-border`, etc.). No `#hex`, `rgb()`, `oklch()`, or Tailwind palette colors (`bg-zinc-800`) in plugin code.
2. **Always use shadcn/ui components** for standard UI patterns. Do not rebuild buttons, inputs, menus, dialogs, or other primitives from scratch.
3. **Icons come from `react-icons/md`** (Material Design). Import from `"react-icons/md"`. All icons accept `{ className?: string }`.

## Color Tokens

Use these semantic classes — they adapt to light/dark mode automatically:

| Purpose           | Background         | Text                        | Border              |
|-------------------|--------------------|-----------------------------|---------------------|
| Page / main area  | `bg-background`    | `text-foreground`           | `border-border`     |
| Cards / panels    | `bg-card`          | `text-card-foreground`      | `border-border`     |
| Sidebar           | `bg-sidebar`       | `text-sidebar-foreground`   | `border-sidebar-border` |
| Muted / secondary | `bg-muted`         | `text-muted-foreground`     | —                   |
| Interactive hover | `hover:bg-accent`  | `hover:text-accent-foreground` | —                |
| Primary actions   | `bg-primary`       | `text-primary-foreground`   | —                   |
| Destructive       | `bg-destructive`   | `text-destructive`          | —                   |

## Typography

Use Tailwind utility classes. Do not define custom font sizes or weights.

| Element              | Classes                                      |
|----------------------|----------------------------------------------|
| Page title           | `text-lg font-semibold`                      |
| Section header       | `text-sm font-medium text-muted-foreground`  |
| Body text            | `text-sm text-foreground`                    |
| Secondary text       | `text-sm text-muted-foreground`              |
| Caption / metadata   | `text-xs text-muted-foreground`              |
| Inline code          | `bg-muted px-1 rounded text-sm`             |

## Spacing

All spacing uses Tailwind's 4px grid (`p-1` = 4px, `p-2` = 8px, etc.).

### Sidebar panels (contributed to `Shell.Sidebar`)

- Panel content padding: `px-4 pb-3`
- List items: use `SidebarMenu` + `SidebarMenuItem` + `SidebarMenuButton` — they handle spacing internally
- Between sidebar sections: handled by the shell via `<Separator>` — plugins do not add their own separators

### Main area panes (contributed to `Shell.Main` or opened via `Shell.OpenPane`)

- Outer padding: `p-6`
- Gap between stacked elements: `space-y-4` or explicit `mb-` on individual elements
- Content max width: unconstrained by default (let the shell handle layout)

### General spacing rules

- Prefer `gap-*` (flex/grid gap) over margin for sibling spacing
- Vertical section spacing: `space-y-6` between major sections, `space-y-2` within a section
- Do not use arbitrary values (`p-[13px]`) — stick to the Tailwind scale

## Components

### Buttons

Always use the `Button` component from `@/components/ui/button`:

```tsx
import { Button } from "@/components/ui/button";

// Primary action
<Button>Save</Button>

// Secondary action
<Button variant="secondary" size="sm">Cancel</Button>

// Destructive
<Button variant="destructive">Delete</Button>

// Ghost (toolbar, icon buttons)
<Button variant="ghost" size="icon"><MdSettings className="size-4" /></Button>
```

**Variant selection:**
- `default` — Primary call-to-action (one per view, if any)
- `secondary` — Standard actions
- `ghost` — Toolbar buttons, inline actions, low-emphasis
- `destructive` — Irreversible actions (delete, remove)
- `outline` — Alternative to secondary when you need a border
- `link` — Inline text links

**Size selection:**
- `default` — Main area actions
- `sm` — Sidebar actions, compact UI
- `icon` — Icon-only buttons (always pair with a tooltip)

### Lists in the sidebar

Always use the sidebar menu components:

```tsx
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";

<SidebarMenu>
  {items.map((item) => (
    <SidebarMenuItem key={item.id}>
      <SidebarMenuButton onClick={() => handleClick(item)}>
        {item.label}
      </SidebarMenuButton>
    </SidebarMenuItem>
  ))}
</SidebarMenu>
```

### Separators

Use `<Separator>` from `@/components/ui/separator` for horizontal rules within a pane. The shell handles separators between sidebar sections — plugins should not add them between contributed sections.

### Scroll areas

Use `<ScrollArea>` from `@/components/ui/scroll-area` when content can overflow. The shell already wraps the main area in a scroll area — sidebar components generally do not need their own.

### Tooltips

Icon-only buttons and cryptic controls must have tooltips:

```tsx
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger
    render={
      <Button variant="ghost" size="icon"><MdSettings className="size-4" /></Button>
    }
  />
  <TooltipContent>Settings</TooltipContent>
</Tooltip>
```

## Icon Sizing

Consistent icon sizes across the app:

| Context                  | Size class |
|--------------------------|------------|
| Sidebar group label icon | `size-4`   |
| Toolbar icon             | `size-4`   |
| Button icon (inline)     | `size-4`   |
| Status bar icon          | `size-3`   |
| Large feature icon       | `size-6`   |

Always use the `size-*` utility (sets both width and height), never `w-*` + `h-*` separately.

## Empty States

When a pane or section has no content, show a centered muted message — never leave it blank:

```tsx
<div className="flex items-center justify-center h-full">
  <p className="text-sm text-muted-foreground">No items yet</p>
</div>
```

## Things to Avoid

- Custom CSS files or `<style>` tags in plugins — use Tailwind classes exclusively
- `className` strings built with template literals — use the `cn()` utility from `@/lib/utils` for conditional classes
- Inline styles (`style={{ ... }}`) — use Tailwind
- Z-index values — let shadcn components handle layering
- Fixed/absolute positioning — prefer flex/grid layout; overlays should use shadcn `Sheet` or `Dialog`
- `!important` — never
- Animations beyond what shadcn provides — keep UI snappy, not flashy
