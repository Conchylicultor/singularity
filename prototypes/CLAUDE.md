# Prototypes

A prototype is a throwaway UI mockup: one folder, one `index.html`, nothing
shared with anything else.

## Where they live: `~/.singularity/prototypes/`, NOT this directory

**Prototypes are not checked in.** Write them to `~/.singularity/prototypes/<name>/`
and commit nothing. This directory holds only `_template/` and this file.

Why: that one directory is shared by every worktree and by main. A mock you save
there is on screen immediately at `http://singularity.localhost:9000` — no build,
no push, no merge — and it outlives the worktree that wrote it. It is backed up
by the `prototypes` backup source, which is what makes it recoverable now that
git isn't.

The server seeds `_template/` into that directory on boot, so the whole gesture
happens in one place:

```bash
cp -R ~/.singularity/prototypes/_template ~/.singularity/prototypes/<name>
```

`./singularity check` fails if a prototype folder appears in the repo.

## Design from a blank page

**Do not open another prototype's folder.** Not to see how it is built, not to
borrow a color, not to check a convention. Prototypes exist to explore ideas
that have not been had yet, and the fastest way to lose that is to start from
someone else's answer.

Start by copying the seeded `_template/` (see above) — it is deliberately
design-less, so everything
you see on screen will be a decision you made. Do not read `plugins/` either;
the app's own components and tokens are not a starting point here.

## The folder

```
~/.singularity/prototypes/
  <name>/
    index.html     # the only required file
    styles.css     # optional
    data.js        # optional
    photo.png      # optional
```

**Flat, no subdirectories.** The server serves `<name>/<file>` and nothing
deeper, so `<name>/assets/icon.svg` will 404. Keep every file at the top level
of your folder.

Reference your files relatively: `href="styles.css"`, `src="data.js"`.

## It must open by double-click

**Open `~/.singularity/prototypes/<name>/index.html` in Finder. It has to
render.** No server,
no build step. If it only works through the app, it is not a prototype.

That rules one thing out: **JSX cannot live in a separate file.** Babel fetches
a `<script type="text/babel" src="…">` over XHR, and the browser blocks that on
`file://`. Write your JSX inline in `index.html` instead. Plain `.js` files,
`.css` files, images and CDN `<script>` tags all load fine.

## The three metadata tags

The gallery reads these out of your HTML — there is no metadata file.

```html
<title>Your prototype</title>
<meta name="description" content="A sentence about what this explores." />
<meta name="prototype-viewport" content="1320x868" />
```

- `<title>` is the card's name. Without it, the folder name is used.
- `<meta name="description">` is the card's blurb.
- `<meta name="prototype-viewport">` is the canvas size in Focus and Compare.
  Optional — it defaults to `1280x800`.

## A prototype can be anything

Not necessarily a full-screen app. A single button, one card, a menu opening, a
color study, three headers side by side — all prototypes. Build the smallest
thing that shows the idea.

React is optional. Plain HTML and CSS is often enough; uncomment the template's
CDN tags only when you need state.
