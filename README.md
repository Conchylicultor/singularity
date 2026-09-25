# Singularity

A self-evolving app for the agentic era: a nested todo list whose tasks are
worked on by coding agents, each in its own git worktree, each deploying its
own copy of the app — and the app is used to improve itself.

## Install

On macOS (Apple Silicon), in a terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/Conchylicultor/singularity/main/install.sh | bash
```

Already cloned or forked the repo? Run `./install.sh` from inside it instead.

The installer says what it will do before it does it: the Xcode command-line
tools, [mise](https://mise.jdx.dev) and the exact toolchain `mise.lock`
records, and Claude Code; then it starts and builds the app (~10–15 minutes)
and leaves it at <http://singularity.localhost:9000>. Agents run on Claude
Code, so they need a Claude account — the installer offers the sign-in at the
end. The app comes back by itself after a reboot.

Step by step, and everything else about the setup: [`docs/setup.md`](docs/setup.md).
