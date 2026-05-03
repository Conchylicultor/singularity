package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// Embedded Postgres lifecycle, supervised by the gateway. The cluster is a
// host-level singleton: one initdb, one running daemon, shared by every
// worktree backend (each worktree has its own database inside this cluster).
//
// `pg_ctl start` daemonizes PG (fork + setsid), so the spawned process exits
// immediately after PG is up — PG itself becomes an orphan reparented to init.
// We can't watch it with cmd.Wait(); instead the watchdog polls the Unix
// socket every 2s. If PG dies, we attempt one re-spawn; if that fails too, we
// stop and surface PgStateCrashed via /api/database/status.
//
// Constants below mirror plugins/infra/plugins/database/shared/internal/paths.ts
// and binaries.ts. They MUST stay in sync — worktree backends still resolve
// these paths from the TS side via embedded-pg-defaults.ts.
const (
	pgPort        = 5433
	pgUser        = "singularity"
	pgMajor       = 18
	pgMaxConns    = 500
	pgWatchdogTTL = 2 * time.Second
	pgReadyTTL    = 30 * time.Second
)

// PgState is the lifecycle state of the embedded PG cluster.
type PgState int

const (
	PgStateStopped PgState = iota
	PgStateStarting
	PgStateRunning
	PgStateCrashed
)

func (s PgState) String() string {
	switch s {
	case PgStateStopped:
		return "stopped"
	case PgStateStarting:
		return "starting"
	case PgStateRunning:
		return "running"
	case PgStateCrashed:
		return "crashed"
	default:
		return "unknown"
	}
}

// PgStatusResponse is the JSON shape of GET /api/database/status.
type PgStatusResponse struct {
	Pg          string `json:"pg"`
	UseSystemPg bool   `json:"useSystemPg"`
}

// PgSupervisor manages the embedded Postgres cluster lifecycle. It is owned
// by main and outlives every backend. Methods are safe to call concurrently.
type PgSupervisor struct {
	repoRoot   string
	pgDir      string
	dataDir    string
	socketDir  string
	socketPath string // <socketDir>/.s.PGSQL.<port>
	logFile    string
	pidFile    string
	binDir     string // resolved on Start; empty until then
	useSystem  bool

	mu        sync.Mutex
	state     PgState
	watchStop chan struct{}
}

// NewPgSupervisor constructs a supervisor; does not start PG yet.
// repoRoot is the main checkout (not the worktree); used to locate the
// platform-specific embedded-postgres binaries under
// <repoRoot>/plugins/infra/plugins/database/node_modules/@embedded-postgres/<plat>/.
func NewPgSupervisor(repoRoot string) *PgSupervisor {
	home, _ := os.UserHomeDir()
	pgDir := filepath.Join(home, ".singularity", "postgres")
	dataDir := filepath.Join(pgDir, fmt.Sprintf("data-pg%d", pgMajor))
	socketDir := filepath.Join(pgDir, "socket")
	return &PgSupervisor{
		repoRoot:   repoRoot,
		pgDir:      pgDir,
		dataDir:    dataDir,
		socketDir:  socketDir,
		socketPath: filepath.Join(socketDir, fmt.Sprintf(".s.PGSQL.%d", pgPort)),
		logFile:    filepath.Join(pgDir, "postgres.log"),
		pidFile:    filepath.Join(dataDir, "postmaster.pid"),
		useSystem:  os.Getenv("SINGULARITY_USE_SYSTEM_PG") == "1",
		state:      PgStateStopped,
	}
}

// Start brings PG up (or reattaches if already running) and arms the
// watchdog. Blocks until PG is ready or returns an error. Must be called
// before any code that connects to the cluster — typically before central is
// eagerly spawned in main.
func (s *PgSupervisor) Start(ctx context.Context) error {
	if s.useSystem {
		slog.Info("pg: SINGULARITY_USE_SYSTEM_PG=1; skipping embedded PG supervision")
		s.setState(PgStateRunning)
		return nil
	}

	s.setState(PgStateStarting)

	binDir, err := s.resolveBinDir()
	if err != nil {
		s.setState(PgStateStopped)
		return err
	}
	s.binDir = binDir

	if err := s.ensureSymlinks(binDir); err != nil {
		s.setState(PgStateStopped)
		return fmt.Errorf("pg: ensure symlinks: %w", err)
	}

	// PG is detached from this gateway's process group, so a freshly-started
	// gateway finds PG already running (left over by a prior gateway). Reattach
	// by socket health rather than spawning a duplicate.
	if pidExists(s.pidFile) && s.pingSocket(1500*time.Millisecond) {
		slog.Info("pg: embedded PG already running; reattaching", "socket", s.socketDir, "port", pgPort)
		s.setState(PgStateRunning)
		s.startWatchdog(ctx)
		return nil
	}

	if dataDirPartial(s.dataDir) {
		slog.Info("pg: data dir partial (no PG_VERSION); cleaning and re-initdb", "dataDir", s.dataDir)
		if err := os.RemoveAll(s.dataDir); err != nil {
			s.setState(PgStateStopped)
			return fmt.Errorf("pg: clear partial data dir: %w", err)
		}
	}

	fresh := !dataDirValid(s.dataDir)
	if fresh {
		if err := s.runInitdb(); err != nil {
			s.setState(PgStateStopped)
			return fmt.Errorf("pg: initdb: %w", err)
		}
	} else if pidExists(s.pidFile) {
		// Stale pidfile from a crashed prior run; pg_ctl start refuses until it's gone.
		slog.Info("pg: removing stale postmaster.pid")
		_ = os.Remove(s.pidFile)
	}

	if err := s.startPg(); err != nil {
		s.setState(PgStateStopped)
		return fmt.Errorf("pg: pg_ctl start: %w", err)
	}

	s.setState(PgStateRunning)
	s.startWatchdog(ctx)
	slog.Info("pg: embedded PG ready", "socket", s.socketDir, "port", pgPort)
	return nil
}

// Status returns the JSON-serializable status for GET /api/database/status.
func (s *PgSupervisor) Status() PgStatusResponse {
	if s.useSystem {
		return PgStatusResponse{Pg: "running", UseSystemPg: true}
	}
	s.mu.Lock()
	st := s.state
	s.mu.Unlock()
	return PgStatusResponse{Pg: st.String(), UseSystemPg: false}
}

// Stop clears the watchdog ticker. PG itself keeps running — it is a
// long-lived daemon owned by no gateway instance, surviving gateway restart
// on every `./singularity start`. A full PG stop is a separate manual op
// (`pg_ctl stop -D <data>`).
func (s *PgSupervisor) Stop() {
	s.mu.Lock()
	if s.watchStop != nil {
		close(s.watchStop)
		s.watchStop = nil
	}
	s.mu.Unlock()
}

// ─── internals ───────────────────────────────────────────────

func (s *PgSupervisor) setState(st PgState) {
	s.mu.Lock()
	s.state = st
	s.mu.Unlock()
}

// resolveBinDir locates the platform-specific embedded-postgres bin directory.
// The npm package is an optional dep of plugins/infra/plugins/database, so
// binaries land under that plugin's local node_modules.
func (s *PgSupervisor) resolveBinDir() (string, error) {
	if s.repoRoot == "" {
		return "", errors.New("pg: -repo-root flag is required to resolve embedded PG binaries")
	}
	pkg, err := platformPgPackage()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(s.repoRoot, "plugins", "infra", "plugins", "database",
		"node_modules", pkg, "native", "bin")
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		return "", fmt.Errorf("pg: embedded PG binaries not found at %s; run `bun install`", dir)
	}
	return dir, nil
}

// platformPgPackage maps the current GOOS/GOARCH to the npm sub-package name
// shipped by `embedded-postgres`. Mirrors the TS `platformPackage()` in
// shared/internal/binaries.ts.
func platformPgPackage() (string, error) {
	switch runtime.GOOS + "/" + runtime.GOARCH {
	case "darwin/arm64":
		return "@embedded-postgres/darwin-arm64", nil
	case "darwin/amd64":
		return "@embedded-postgres/darwin-x64", nil
	case "linux/amd64":
		return "@embedded-postgres/linux-x64", nil
	case "linux/arm64":
		return "@embedded-postgres/linux-arm64", nil
	}
	return "", fmt.Errorf("pg: unsupported platform %s/%s", runtime.GOOS, runtime.GOARCH)
}

// ensureSymlinks recreates the unversioned dylib/so aliases that PG's runtime
// loader expects. The npm tarball ships `pg-symlinks.json` listing the links
// because npm doesn't preserve symlinks across tarball install. Idempotent —
// existing links are skipped. Mirrors the TS `ensurePgSymlinks()`.
func (s *PgSupervisor) ensureSymlinks(binDir string) error {
	pkgRoot := filepath.Dir(filepath.Dir(binDir)) // <binDir>/../../  → <pkgRoot>
	manifestPath := filepath.Join(pkgRoot, "native", "pg-symlinks.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil // platform without aliases — fine
		}
		return err
	}
	var entries []struct {
		Source string `json:"source"`
		Target string `json:"target"`
	}
	if err := json.Unmarshal(data, &entries); err != nil {
		return fmt.Errorf("parse pg-symlinks.json: %w", err)
	}
	for _, e := range entries {
		linkPath := filepath.Join(pkgRoot, e.Target)
		if _, err := os.Lstat(linkPath); err == nil {
			continue
		}
		// Link content is basename-only so it resolves relative to its own dir.
		if err := os.Symlink(filepath.Base(e.Source), linkPath); err != nil && !errors.Is(err, os.ErrExist) {
			return fmt.Errorf("symlink %s: %w", linkPath, err)
		}
	}
	return nil
}

// dataDirValid: initdb writes PG_VERSION last. Its presence means the cluster
// is fully initialized.
func dataDirValid(dataDir string) bool {
	_, err := os.Stat(filepath.Join(dataDir, "PG_VERSION"))
	return err == nil
}

// dataDirPartial: data dir present but PG_VERSION missing — interrupted initdb.
func dataDirPartial(dataDir string) bool {
	if _, err := os.Stat(dataDir); err != nil {
		return false
	}
	return !dataDirValid(dataDir)
}

func pidExists(pidFile string) bool {
	_, err := os.Stat(pidFile)
	return err == nil
}

func (s *PgSupervisor) runInitdb() error {
	if err := os.MkdirAll(s.pgDir, 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(s.socketDir, 0o700); err != nil {
		return err
	}
	slog.Info("pg: running initdb", "dataDir", s.dataDir)
	cmd := exec.Command(filepath.Join(s.binDir, "initdb"),
		"-D", s.dataDir,
		"-U", pgUser,
		"-A", "trust",
		"--no-locale",
		"--encoding", "UTF8",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("initdb failed: %w: %s", err, string(out))
	}
	return nil
}

// startPg runs `pg_ctl start -w` which forks PG, waits for it to accept
// connections, then exits — leaving PG running with no parent. The -o args
// pin PG to a non-default Unix socket and disable TCP listening.
//
// `-w` makes pg_ctl wait by opening a libpq connection. Since we listen only
// on the non-default socket, pg_ctl needs PGHOST/PGPORT/PGUSER in env to find
// PG — otherwise it dials TCP loopback that doesn't exist and times out.
func (s *PgSupervisor) startPg() error {
	cmd := exec.Command(filepath.Join(s.binDir, "pg_ctl"),
		"start",
		"-D", s.dataDir,
		"-l", s.logFile,
		"-o", fmt.Sprintf("-k %s -p %d -c max_connections=%d -c listen_addresses=",
			s.socketDir, pgPort, pgMaxConns),
		"-w",
		"-t", fmt.Sprintf("%d", int(pgReadyTTL/time.Second)),
	)
	cmd.Env = append(os.Environ(),
		"PGHOST="+s.socketDir,
		fmt.Sprintf("PGPORT=%d", pgPort),
		"PGUSER="+pgUser,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("pg_ctl start failed: %w: %s (see %s)", err, string(out), s.logFile)
	}
	return nil
}

// pingSocket attempts a Unix-socket connect with the given timeout. Returns
// true if the socket accepted the connection. Used in lieu of pg_isready,
// which embedded-postgres doesn't bundle.
func (s *PgSupervisor) pingSocket(timeout time.Duration) bool {
	c, err := net.DialTimeout("unix", s.socketPath, timeout)
	if err != nil {
		return false
	}
	_ = c.Close()
	return true
}

func (s *PgSupervisor) startWatchdog(ctx context.Context) {
	s.mu.Lock()
	if s.watchStop != nil {
		s.mu.Unlock()
		return
	}
	stop := make(chan struct{})
	s.watchStop = stop
	s.mu.Unlock()
	go s.runWatchdog(ctx, stop)
}

// runWatchdog dials the PG socket every 2s. On failure, attempts one
// re-spawn (clearing the stale pidfile first); if that also fails, marks the
// state Crashed and stops watching. We don't auto-restart in a tight loop —
// that would mask persistent failures.
func (s *PgSupervisor) runWatchdog(ctx context.Context, stop <-chan struct{}) {
	t := time.NewTicker(pgWatchdogTTL)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-stop:
			return
		case <-t.C:
			s.mu.Lock()
			st := s.state
			s.mu.Unlock()
			if st != PgStateRunning {
				continue
			}
			if s.pingSocket(1500 * time.Millisecond) {
				continue
			}
			slog.Error("pg: watchdog detected PG down; attempting one re-spawn")
			s.setState(PgStateStarting)
			_ = os.Remove(s.pidFile)
			if err := s.startPg(); err != nil {
				slog.Error("pg: re-spawn failed; not retrying", "err", err)
				s.setState(PgStateCrashed)
				return
			}
			s.setState(PgStateRunning)
			slog.Info("pg: re-spawned successfully")
		}
	}
}
