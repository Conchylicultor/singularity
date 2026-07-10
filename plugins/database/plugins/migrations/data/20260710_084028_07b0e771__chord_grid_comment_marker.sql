-- Custom SQL migration file, put your code below! --
-- migration: 20260710_084028__chord_grid_comment_marker --

-- The chord-grid mini-language moved its comment marker from `#` to `;`.
--
-- `#` is the sharp: it only ever worked as a comment marker because no chord
-- symbol may *begin* with one, leaving the cell-opening position free. Roman
-- numerals ended that — `♯IV` is an ordinary raised degree — so the marker moved
-- off the musical alphabet entirely. `;` now starts a comment anywhere, and `#`
-- is always a sharp.
--
-- Rewrite the `#` that OPENS a cell (start of text, or after whitespace / a `|`)
-- to `;`, exactly matching the lexer rule this replaces. Every other `#` is a
-- sharp and must survive untouched: in `F#m` it follows a letter, in `G7(#5)` a
-- `(` — neither is in the match class, so neither is rewritten. The capture group
-- preserves the character that established the cell boundary.
UPDATE sonata_songs_ext_chord_grid
   SET chord_text = regexp_replace(chord_text, '(^|[[:space:]|])#', '\1;', 'g')
 WHERE chord_text ~ '(^|[[:space:]|])#';
