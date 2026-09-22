# Prototypes

A prototype is a throwaway UI mockup: one folder, one `index.html`, nothing
shared with anything else.

## Where they live: `~/.singularity/apps/prototypes/`, NOT this directory

**Prototypes are not checked in.** They live in `~/.singularity/apps/prototypes/<id>/`
and you commit nothing. This directory holds only `_template/` and this file.

Why: that one directory is shared by every worktree and by main. A mock you save
there is on screen immediately at `http://singularity.localhost:9000` — no build,
no push, no merge — and it outlives the worktree that wrote it. It is backed up
by the `prototypes` backup source, which is what makes it recoverable now that
git isn't.

`./singularity check` fails if a prototype folder appears in the repo.

## You do not create the folder by hand

```bash
./singularity prototype new "Your title"
```

That mints the folder, copies the blank `_template/` into it, and prints the id
and URL. **Never `cp -R _template …`, and never pick the folder name** — it is a
minted id (`proto-1786877040-w2vi`), not a slug, because the id is how a
prototype is referenced elsewhere and must not change when the mock gets its
real name. That name is its `<title>`; the gallery card, pane header and chips
all show that, never the id. `./singularity prototype list` prints both.

Launched from the gallery's **New prototype** button? The folder already exists
and your prompt names it — edit that one, don't mint a second.

Write the id in your messages: it renders as a chip that opens the mock in a
column beside the text.

## History: every turn is saved

Each agent turn that changes the folder is recorded as a **version**,
automatically — you do nothing. The user steps through versions with the
`‹ v3 of 7 ›` arrows in the prototype's pane, and can restore any of them.

Before you change a prototype someone has already iterated on, read how it got
here — what was asked for, what was tried, in what order:

```bash
./singularity prototype log <id>       # versions, newest first, with each request
./singularity prototype log <id> -p    # ... and the diff each one made
```

`./singularity prototype restore <id> v3` makes an old version live again
(nothing is lost: unsaved changes are saved first). `./singularity prototype
checkpoint <id> -m "…"` records a version by hand — only needed for edits made
outside an agent turn.

The history is kept beside the folder (`_history/`), not in it. **Never create a
`.git` or any subfolder inside a prototype folder**, and never touch
`_history/`.

## Design from a blank page

**Do not open another prototype's folder.** Not to see how it is built, not to
borrow a color, not to check a convention. Prototypes exist to explore ideas
that have not been had yet, and the fastest way to lose that is to start from
someone else's answer.

The folder you were given holds the blank `_template/` — deliberately
design-less, so everything you see on screen will be a decision you made. Do not
read `plugins/` either; the app's own components and tokens are not a starting
point here.

## The folder

```
~/.singularity/apps/prototypes/
  <id>/
    index.html     # the only required file
    styles.css     # optional
    data.js        # optional
    photo.png      # optional
```

**Flat, no subdirectories.** The server serves `<id>/<file>` and nothing
deeper, so `<id>/assets/icon.svg` will 404. Keep every file at the top level
of your folder.

Reference your files relatively: `href="styles.css"`, `src="data.js"`.

## It must open by double-click

**Open `~/.singularity/apps/prototypes/<id>/index.html` in Finder. It has to
render.** No server,
no build step. If it only works through the app, it is not a prototype.

That rules one thing out: **JSX cannot live in a separate file.** Babel fetches
a `<script type="text/babel" src="…">` over XHR, and the browser blocks that on
`file://`. Write your JSX inline in `index.html` instead. Plain `.js` files,
`.css` files, images and CDN `<script>` tags all load fine.

## The four metadata tags

The gallery reads these out of your HTML — there is no metadata file.

```html
<title>Your prototype</title>
<meta name="description" content="A sentence about what this explores." />
<meta name="prototype-viewport" content="1320x868" />
<meta name="mocks" content="fixture:control-panel/setting-rail" />
```

- `<title>` is the card's name — the prototype's ONLY human name, since the
  folder is an id. Without it every surface reads "Untitled prototype".
- `<meta name="description">` is the card's blurb.
- `<meta name="prototype-viewport">` is the size you design at: the canvas
  in Focus and on the gallery card, and the width Compare opens at. Optional —
  it defaults to `1280x800`. Don't copy it into your CSS as a fixed width (see
  below).
- `<meta name="mocks">` names the real app thing this prototype is a mockup
  of, as `<kind>:<ref>`, so the Compare stage can put the two side by side:
  - `fixture:control-panel/setting-rail` — an app **component**, by its Layout
    Lab fixture id.
  - `route:/agents/c/123` — a whole app **screen**: the running app itself,
    framed at that in-app path (no rail, no tab bar).
  - `component:task-draft/composer` — one real app **component** as the
    running app renders it (real slots, config, data), by the id its owning
    plugin exhibits it under (`plugin-meta/specimens`). For an element that
    lives inside a popover or deep in a screen, which `route:` cannot reach.
  - `app:/agents` — the **whole app**, chrome included: the running app at that
    path with its rail, tab bar and action bar, as a person sees it in their own
    tab. For a mock of the chrome itself, or of a theme across chrome and screen.

  The kinds are open — the Compare stage lists the ones this worktree knows,
  with an example of each. A value with no `<kind>:` prefix is reported as a
  problem on the card. Most prototypes are not a mockup of anything in the app —
  leave the tag out and nothing is missing.

A fifth, `<meta name="prototype-option">`, declares variants — see Options.

## Lay it out fluid, not at a fixed width

Use `max-width` plus side padding, not `width: 1280px`, and let grids stack when
there is no room. The template's `#root` already fills its frame.

Why: with a `mocks` tag, Compare frames your mock at the widths the reader picks
(a `route:` or `app:` counterpart offers 480 / 768 / 1024 / 1280 / 1600), and your media
queries run. A fixed-width mock gets cropped there while the real screen
reflows beside it. So a mock of a screen needs breakpoints for those widths.

## One request, one prototype

**Only ever create a single prototype.** Run `./singularity prototype new` at
most once per request — and not at all when your prompt already names a folder.
Asked for three directions, three layouts or "a few ideas"? That is still one
prototype: build every direction inside it and declare them as an option (see
below), e.g. `direction: dense | airy | split`.

Why: the reader compares variants by flipping one pill in place — same canvas,
same scroll, same history. Spread across separate prototypes, the variants turn
into near-duplicate gallery cards with forked version histories, and comparing
them means jumping between panes.

## Options: variants the reader flips between

If the design has versions to compare — a palette, a pane style, a density, or
whole alternative designs — **declare them; never build a switcher, toggle bar
or settings panel into the page to flip between them, and never split them into
separate prototypes.** The app draws the picker itself, as a small pill
floating over the stage, outside your page. So your page holds only the design:
the picker takes no canvas space, shows up in no screenshot or thumbnail, and
your CSS never has to style it.

```html
<html lang="en" data-palette="violet" data-pane="flush">
<head>
<meta name="prototype-option" content="palette: violet | indigo | azure" />
<meta name="prototype-option" content="pane: flush | floating | soft-tray" />
```

- **One tag per option**: `<name>: <value> | <value> | …`. Tag order is picker
  order; value order is chip order. Names are lowercase letters, digits and
  dashes starting with a letter (`v` is reserved); values are lowercase letters,
  digits and dashes (`3-octaves` is fine). The picker shows them humanized
  (`soft-tray` → "Soft tray"), so pick readable tokens.
- **The default is the attribute you write on `<html>`**: `data-<name>="<value>"`,
  one of the declared values. The page then carries the attribute everywhere —
  double-clicked off disk, in the thumbnail, in the app — and the app only
  overwrites it with the value the reader picked.
- **Style each value** with `:root[data-palette="azure"] { … }` (the default can
  be targeted the same way), or read `document.documentElement.dataset.palette`
  in JS. Read it once, at load: picking a value reloads the frame with the new
  attribute, so nothing has to listen for a change.
- Options are choices only — no sliders. A tuning slider that is part of what
  the prototype explores stays in the page.

Not an option: a control that is part of the design itself (the product's own
dropdown, a play button in a player). Options are for the reader choosing which
version of the design to look at.

A line that cannot be an option (malformed, a missing or unknown default, a
duplicate) is left out of the picker and reported as a problem on the card.

### Which variant is the user looking at?

The user's picks are one shared record per prototype: every tab and every
deploy (main and each worktree) shows the same variant and follows a new pick
live. Read it from the terminal:

```bash
./singularity prototype options <id>
```

It prints each option with the value on screen (picked, or the page's default)
and its values, then the document URL of exactly that variant. If you were
launched from Improve, your prompt says what was picked at launch; the user may
have flipped it since, so run this when it matters. `prototype list` shows a
`picked:` line under each prototype that is not on its defaults.

### Rendering a variant yourself

Load the prototype's document with the options in its query — the same
`?<option>=<value>` the app puts on its frames:

```bash
./singularity run plugins/framework/plugins/tooling/plugins/e2e-harness/e2e/screenshot.ts \
  --path "/api/prototypes/<id>/index.html?palette=azure&pane=floating"
```

The server stamps the values onto `<html data-*>`, so the page renders that
variant; a name or value the page does not declare is a 400, not the default.
`prototype options` prints the line for the current variant, ready to run.

**Never change the user's picks.** They are the user's choice of what to look
at; there is no command that sets them, and loading a document URL saves
nothing. (A browser script that clicks the picker does change them, for
everybody — the e2e harness puts them back when its run ends.)

## A prototype can be anything

Not necessarily a full-screen app. A single button, one card, a menu opening, a
color study, three headers side by side — all prototypes. Build the smallest
thing that shows the idea.

React is optional. Plain HTML and CSS is often enough; uncomment the template's
CDN tags only when you need state.
