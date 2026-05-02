# dotfiles

Tracked-in-git copies of personal config that should land on every new machine.

## Layout

```
home/        # mirrors $HOME — anything here gets copied into $HOME on bootstrap
bootstrap.sh # copy-on-deploy installer
```

## Adding a config

Drop the file at the path it should occupy under `$HOME`, e.g. `~/.tmux.conf` lives at `home/.tmux.conf`. No script changes needed — `bootstrap.sh` walks `home/` recursively.

## Deploying

```bash
./bootstrap.sh
```

Idempotent. For each file under `home/`:
- if `$HOME/<path>` is byte-identical, skip (`=`)
- if it exists and differs, move it to `<path>.backup-<timestamp>` and copy the new one (`~`)
- if it doesn't exist, create it (`+`)

Copy-on-deploy (not symlinks): edits in `$HOME` do **not** flow back to the repo — pull changes into `home/` manually when you want to commit them.
