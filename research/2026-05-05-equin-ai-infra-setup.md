# equin.ai — Infrastructure Setup

Status tracker for Step 1 of the [deployment roadmap](./2026-05-04-global-equin-ai-deployment-roadmap.md).

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Server provider | Hetzner | 5–7× cheaper than DigitalOcean/AWS for equivalent specs |
| Server spec | CX32 (4 vCPU, 8 GB RAM) | Headroom for marketplace later; €9/mo |
| Location | Nuremberg, Germany (`nbg1`) | Ashburn (US) had no CX32 availability |
| OS | Ubuntu 24.04 LTS | Most tutorial/doc coverage; identical to Debian for this use case |
| Postgres | Self-hosted on same box | Demo is read-only, no user data; migrate to managed if needed |
| Cloudflare plan | Free tier | DNS-only wildcard (`*.equin.ai`) is sufficient; no need for proxied wildcard |
| Caddy TLS | Caddy terminates (Let's Encrypt wildcard via Cloudflare DNS challenge) | Gateway stays plain HTTP on local socket |

---

## Server

| Field | Value |
|---|---|
| Name | `equin-prod` |
| IP | `49.13.197.105` |
| Provider | Hetzner Cloud |
| Spec | CX32 — 4 vCPU, 8 GB RAM, 80 GB NVMe |
| OS | Ubuntu 24.04 LTS |
| Backups | Enabled (daily snapshots) |
| Status | **Created, not yet bootstrapped** |

SSH access:
```bash
ssh root@49.13.197.105
```

---

## Bootstrap script

Ready to run, not yet executed. Covers:

- UFW firewall (ports 22, 80, 443 only)
- SSH hardening (password auth disabled)
- `equin` system user (sudo, SSH key copied from root)
- PostgreSQL — `equin` user + `equin` database, random password saved to `/root/equin.env`
- Go (latest) + xcaddy → Caddy binary with `caddy-dns/cloudflare` plugin
- Bun
- systemd unit for Caddy
- `/opt/equin/{gateway,server,web,backups}` directory structure

---

## Remaining Step 1 tasks

- [ ] Run bootstrap script on server
- [ ] Set up Cloudflare DNS
  - `A equin.ai → 49.13.197.105` (proxied)
  - `A *.equin.ai → 49.13.197.105` (DNS-only, free tier)
  - Obtain Cloudflare API token (for Caddy DNS challenge)
- [ ] Write `/etc/caddy/Caddyfile` with wildcard TLS config
- [ ] Start and verify Caddy (`systemctl start caddy`, check cert provisioning)
- [ ] Verify `equin.ai` and `*.equin.ai` resolve and serve HTTPS

---

## Next steps (Step 2)

Once Step 1 is done, proceed to [Gateway Adaptation](./2026-05-04-global-equin-ai-deployment-roadmap.md#step-2--gateway-adaptation):
- Add `-base-domain` flag to the Go gateway
- Update `parseWorktree()` to accept `*.equin.ai`
- Make CLI health probe URLs configurable via `SINGULARITY_BASE_DOMAIN`
