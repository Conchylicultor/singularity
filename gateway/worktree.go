package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// macOS sun_path is 104 bytes; Linux is 108. We pick the tighter limit so
// developer machines and CI agree.
const maxSocketPath = 104

// State is the lifecycle state of a worktree's backend process.
type State int

const (
	StateIdle State = iota
	StateStarting
	StateRunning
	StateRestarting
	StateStopping
	StateBroken
)

func (s State) String() string {
	switch s {
	case StateIdle:
		return "idle"
	case StateStarting:
		return "starting"
	case StateRunning:
		return "running"
	case StateRestarting:
		return "restarting"
	case StateStopping:
		return "stopping"
	case StateBroken:
		return "broken"
	default:
		return "unknown"
	}
}

// Spec is the on-disk schema parsed from ~/.singularity/worktrees/<name>.json.
type Spec struct {
	Server    string         `json:"server"`              // absolute path to the backend's working directory (cwd)
	Web       string         `json:"web"`                 // absolute path to web/dist
	Command   []string       `json:"command,omitempty"`   // optional: argv to spawn (release: compiled server binary). When empty, falls back to the bun convention.
	ZeroCache *ZeroCacheSpec `json:"zeroCache,omitempty"` // optional: per-worktree zero-cache sidecar. Absent when the feature is off.
}

// ZeroCacheSpec describes the per-worktree zero-cache sidecar process. The
// server side (which knows PG_PORT/PG_USER) composes it and writes it into
// spec.json; the gateway just execs it — it does NO Postgres work itself.
type ZeroCacheSpec struct {
	Command    []string `json:"command"`    // argv to spawn the zero-cache supervisor
	UpstreamDb string   `json:"upstreamDb"` // ZERO_UPSTREAM_DB DSN for the worktree's fork
	Cwd        string   `json:"cwd"`        // absolute working directory for the command
}

// WorktreeStatus is the public projection of a worktree's state, returned by
// /gateway/worktrees and used by the dashboard plugin.
type WorktreeStatus struct {
	Name         string    `json:"name"`
	State        string    `json:"state"`
	SocketPath   string    `json:"socketPath"`
	LastActivity time.Time `json:"lastActivity"`
	ActiveConns  int       `json:"activeConns"`
	Server       string    `json:"server"`
	Web          string    `json:"web"`
}

var (
	ErrBroken            = errors.New("worktree in broken cooldown")
	ErrSpawnFailed       = errors.New("backend spawn failed")
	ErrStopping          = errors.New("worktree is stopping")
	ErrZeroCacheDisabled = errors.New("zero-cache not configured for this worktree")
)

// backend groups the per-process fields for one running backend instance.
// A Worktree holds at most one active *backend; a second may exist briefly
// as the "draining" old backend during a hot restart.
type backend struct {
	cmd        *exec.Cmd
	exitCh     chan struct{} // closed when cmd.Wait returns
	socketPath string
	proxy      *httputil.ReverseProxy // nil until waitReady succeeds

	// connMu guards both connection counters. httpConns tracks in-flight HTTP
	// requests — bounded, short-lived, and waited on at drain so they finish
	// cleanly instead of resetting into a 502. wsConns tracks WebSocket
	// connections (live-state, terminal, logs) — long-lived, never close on
	// their own, so they are NOT waited on at drain; clients reconnect.
	connMu    sync.Mutex
	httpConns int
	wsConns   int
}

// zeroCache groups the per-process fields for one running zero-cache sidecar.
// It is independent of the backend: it listens on its own loopback TCP port,
// owns its own replication slot + SQLite replica, and is deliberately left
// running across backend hot restarts. The gateway owns only the process and
// request routing; all slot/replica/Postgres cleanup is TS-owned elsewhere.
type zeroCache struct {
	cmd     *exec.Cmd
	exitCh  chan struct{} // closed when cmd.Wait returns
	port    int           // allocated loopback TCP port (127.0.0.1:<port>)
	pidPath string        // <SocketsDir>/<name>.zero.pid sidecar
	proxy   *httputil.ReverseProxy
}

func (b *backend) incHTTP() {
	b.connMu.Lock()
	b.httpConns++
	b.connMu.Unlock()
}

func (b *backend) decHTTP() {
	b.connMu.Lock()
	if b.httpConns > 0 {
		b.httpConns--
	}
	b.connMu.Unlock()
}

func (b *backend) incWS() {
	b.connMu.Lock()
	b.wsConns++
	b.connMu.Unlock()
}

func (b *backend) decWS() {
	b.connMu.Lock()
	if b.wsConns > 0 {
		b.wsConns--
	}
	b.connMu.Unlock()
}

func (b *backend) httpCount() int {
	b.connMu.Lock()
	defer b.connMu.Unlock()
	return b.httpConns
}

func (b *backend) wsCount() int {
	b.connMu.Lock()
	defer b.connMu.Unlock()
	return b.wsConns
}

// conns returns total active connections (in-flight HTTP + WebSocket). Used by
// the idle sweeper and status snapshot, which treat any activity as "busy".
func (b *backend) conns() int {
	b.connMu.Lock()
	defer b.connMu.Unlock()
	return b.httpConns + b.wsConns
}

// Worktree owns one backend's lifecycle: spawn, supervise, proxy, idle teardown.
type Worktree struct {
	Name string

	cfg *Config

	// spec is replaced atomically on file change. Lock-free reads.
	spec atomic.Pointer[Spec]

	// All other fields below are guarded by mu.
	mu           sync.Mutex
	state        State
	active       *backend
	lastActivity time.Time
	brokenUntil  time.Time
	readyCh      chan struct{} // signal-only; waiters re-check state
	lastSpawnErr error

	// activeZero is the running zero-cache sidecar, or nil. Guarded by mu.
	activeZero *zeroCache
	// zeroMu single-flights EnsureZeroCache so concurrent /zero/* requests
	// don't spawn duplicate sidecars. Held only around the cold-start path,
	// never during request proxying.
	zeroMu sync.Mutex

	// restartMu serializes concurrent Restart() calls.
	restartMu sync.Mutex
	// restartDone is non-nil during StateRestarting. Closed when restart
	// settles (success or failure). Snapshot under w.mu; closed by Restart().
	restartDone chan struct{}

	// logBuf is a per-worktree ring of backend stdout/stderr lines. It
	// persists across respawns so crash output remains visible after the
	// process exits. Its own mutex; not guarded by w.mu.
	logBuf *logRing

	// logFile is this worktree's own on-disk log channel (<name>.log). It is
	// the durable counterpart to logBuf, opened lazily on first write and
	// rotated by size. Its own mutex; not guarded by w.mu.
	logFile *rotatingWriter
}

func NewWorktree(name string, spec *Spec, cfg *Config) (*Worktree, error) {
	// Validate the longer .next.sock path — if it fits, the primary .sock does too.
	longest := filepath.Join(cfg.SocketsDir, name+".next.sock")
	if len(longest) > maxSocketPath {
		return nil, fmt.Errorf("socket path %q is %d bytes; exceeds %d-byte limit (rename worktree)", longest, len(longest), maxSocketPath)
	}
	w := &Worktree{
		Name:    name,
		cfg:     cfg,
		logBuf:  newLogRing(cfg.LogBufferLines),
		logFile: newRotatingWriter(filepath.Join(cfg.LogDir, name+".log"), maxLogBytes, maxLogBackups),
	}
	w.spec.Store(spec)
	return w, nil
}

// CloseLog closes the worktree's on-disk log channel. Called when the worktree
// is unregistered; the writer reopens lazily if the worktree is ever used again.
func (w *Worktree) CloseLog() {
	_ = w.logFile.Close()
}

// Spec returns the current spec snapshot. Lock-free.
func (w *Worktree) Spec() *Spec { return w.spec.Load() }

// UpdateSpec replaces the spec atomically. Backend respawn is lazy: changes to
// fields affecting the backend take effect on the next spawn (after the
// current backend, if any, is stopped). Static asset reads pick up the new
// web dir on the next request.
func (w *Worktree) UpdateSpec(s *Spec) {
	w.spec.Store(s)
}

func (w *Worktree) primarySocketPath() string {
	return filepath.Join(w.cfg.SocketsDir, w.Name+".sock")
}

func (w *Worktree) secondarySocketPath() string {
	return filepath.Join(w.cfg.SocketsDir, w.Name+".next.sock")
}

// restartTargetPath returns the socket path to use for the next hot restart.
// Picks whichever of primary/secondary the current active backend is NOT using.
// Must be called with w.mu held.
func (w *Worktree) restartTargetPath() string {
	if w.active != nil && w.active.socketPath == w.primarySocketPath() {
		return w.secondarySocketPath()
	}
	return w.primarySocketPath()
}

// Ensure starts the backend if needed and returns the active backend. The
// caller serves the request through bk.proxy; returning the backend (not just
// the proxy) lets HTTP/WS handlers count their connection against the exact
// process serving it, so drain waits on the right backend.
// Concurrent callers share a single in-flight spawn via readyCh.
func (w *Worktree) Ensure(ctx context.Context) (*backend, error) {
	w.mu.Lock()

	switch w.state {
	case StateRunning:
		bk := w.active
		w.mu.Unlock()
		return bk, nil

	case StateRestarting:
		// Old backend still serving — return it for zero downtime.
		bk := w.active
		w.mu.Unlock()
		return bk, nil

	case StateStarting:
		ch := w.readyCh
		w.mu.Unlock()
		select {
		case <-ch:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		return w.snapshotAfterSpawn()

	case StateStopping:
		w.mu.Unlock()
		return nil, ErrStopping

	case StateBroken:
		if time.Now().Before(w.brokenUntil) {
			err := w.lastSpawnErr
			w.mu.Unlock()
			if err == nil {
				err = ErrBroken
			}
			return nil, err
		}
		// cooled down → fall through to spawn
	}

	// Idle or cooled-down Broken: begin spawn
	w.state = StateStarting
	w.readyCh = make(chan struct{})
	w.lastSpawnErr = nil
	readyCh := w.readyCh
	spec := w.Spec()
	socketPath := w.primarySocketPath()
	w.mu.Unlock()

	// Run the spawn outside the lock so concurrent callers see Starting and wait.
	bk, spawnErr := w.startBackend(spec, socketPath)
	if spawnErr == nil {
		// Make cmd visible so Stop can find it before readiness completes.
		w.mu.Lock()
		w.active = bk
		w.mu.Unlock()
		spawnErr = waitReady(socketPath, w.cfg.ReadyTimeout, bk.exitCh)
	}

	if spawnErr != nil {
		wrapped := fmt.Errorf("%w: %v", ErrSpawnFailed, spawnErr)
		// Kill if the process started; wait (bounded) for the exit goroutine.
		if bk != nil && bk.cmd != nil && bk.cmd.Process != nil {
			signalBackend(bk, syscall.SIGKILL, w.Name)
			waitBackendExit(bk, w.Name, postKillTimeout)
		}
		if bk != nil {
			_ = removeBackendArtifacts(bk.socketPath)
		}
		w.mu.Lock()
		w.active = nil
		w.state = StateBroken
		w.brokenUntil = time.Now().Add(w.cfg.BrokenCooldown)
		w.lastSpawnErr = wrapped
		w.mu.Unlock()
		close(readyCh)
		slog.Warn("backend spawn failed", "worktree", w.Name, "err", wrapped)
		return nil, wrapped
	}

	w.mu.Lock()
	w.state = StateRunning
	bk.proxy = newReverseProxy(socketPath)
	w.lastActivity = time.Now()
	w.mu.Unlock()
	close(readyCh)
	slog.Info("backend ready", "worktree", w.Name, "socket", socketPath)
	return bk, nil
}

func (w *Worktree) snapshotAfterSpawn() (*backend, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.state == StateRunning && w.active != nil {
		return w.active, nil
	}
	if w.lastSpawnErr != nil {
		return nil, w.lastSpawnErr
	}
	return nil, errors.New("spawn did not complete successfully")
}

const drainTimeout = 30 * time.Second

// postKillTimeout bounds the wait for a backend to exit after SIGKILL. The kill
// can silently fail to land (e.g. EPERM, or a wedged group), and the exit
// goroutine that closes bk.exitCh would then never fire — an unbounded receive
// would hang the calling goroutine forever. Cap it and log loudly instead.
const postKillTimeout = 3 * time.Second

// Restart performs a zero-downtime restart: spawns a new backend on the
// alternate socket, waits for it to be ready, atomically swaps the proxy
// pointer, then drains and stops the old backend in the background.
// If the new backend fails to start, the old backend is left intact.
func (w *Worktree) Restart(ctx context.Context) error {
	w.restartMu.Lock()
	defer w.restartMu.Unlock()

	// --- Step 1: Running → Restarting ---
	w.mu.Lock()
	if w.state != StateRunning {
		s := w.state
		w.mu.Unlock()
		return fmt.Errorf("cannot hot-restart in state %s", s)
	}
	w.state = StateRestarting
	oldBk := w.active
	newSocketPath := w.restartTargetPath()
	spec := w.Spec()
	doneCh := make(chan struct{})
	w.restartDone = doneCh
	w.mu.Unlock()

	defer func() {
		w.mu.Lock()
		w.restartDone = nil
		w.mu.Unlock()
		close(doneCh)
	}()

	// --- Step 2: Spawn new backend on alternate socket ---
	slog.Info("hot restart: spawning", "worktree", w.Name, "socket", newSocketPath)
	newBk, spawnErr := w.startBackend(spec, newSocketPath)

	// --- Step 3: Wait for readiness ---
	if spawnErr == nil {
		spawnErr = waitReady(newSocketPath, w.cfg.ReadyTimeout, newBk.exitCh)
	}

	// --- Step 4 (failure): keep old backend, revert state ---
	if spawnErr != nil {
		if newBk != nil && newBk.cmd != nil && newBk.cmd.Process != nil {
			signalBackend(newBk, syscall.SIGKILL, w.Name)
			waitBackendExit(newBk, w.Name, postKillTimeout)
		}
		if newBk != nil {
			_ = removeBackendArtifacts(newBk.socketPath)
		}
		w.mu.Lock()
		if w.state == StateRestarting {
			w.state = StateRunning
		}
		w.mu.Unlock()
		return fmt.Errorf("hot restart failed (old backend intact): %w", spawnErr)
	}

	// --- Step 4 (success): atomic swap ---
	newBk.proxy = newReverseProxy(newSocketPath)
	w.mu.Lock()
	w.active = newBk
	w.state = StateRunning
	w.lastActivity = time.Now()
	w.mu.Unlock()
	slog.Info("hot restart: swapped", "worktree", w.Name,
		"old_socket", oldBk.socketPath, "new_socket", newSocketPath)

	// --- Step 5: Drain old backend in background ---
	go w.drainAndStop(oldBk)
	return nil
}

// drainAndStop lets in-flight HTTP requests on bk finish (up to drainTimeout)
// before terminating the process — killing mid-request resets the connection
// and the client sees a 502. WebSocket connections (live-state, terminal, logs)
// are long-lived and never close on their own, so they are NOT waited on; they
// are cut when the process exits and clients reconnect to the already-live new
// backend. Runs in a goroutine kicked off by Restart(); never modifies w.state.
func (w *Worktree) drainAndStop(bk *backend) {
	deadline := time.Now().Add(drainTimeout)
	for bk.httpCount() > 0 && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if n := bk.httpCount(); n > 0 {
		slog.Warn("drain timeout; forcing stop with in-flight HTTP requests",
			"worktree", w.Name, "httpConns", n)
	}
	if n := bk.wsCount(); n > 0 {
		slog.Info("hot restart: cutting WebSocket connections; clients will reconnect",
			"worktree", w.Name, "wsConns", n)
	}
	if bk.cmd != nil && bk.cmd.Process != nil {
		signalBackend(bk, syscall.SIGTERM, w.Name)
		select {
		case <-bk.exitCh:
		case <-time.After(w.cfg.ShutdownGrace):
			signalBackend(bk, syscall.SIGKILL, w.Name)
			waitBackendExit(bk, w.Name, postKillTimeout)
		}
	}
	_ = removeBackendArtifacts(bk.socketPath)
	slog.Info("hot restart: old backend drained and stopped",
		"worktree", w.Name, "socket", bk.socketPath)
}

// Stop performs a graceful shutdown: SIGTERM → grace → SIGKILL. Idempotent.
// If the worktree is currently spawning, Stop waits for the spawn to settle
// first to avoid racing the spawn cleanup path. If a hot restart is in flight,
// waits for it to settle before stopping.
func (w *Worktree) Stop(ctx context.Context) error {
	w.mu.Lock()
	if w.state == StateStarting {
		ch := w.readyCh
		w.mu.Unlock()
		select {
		case <-ch:
		case <-ctx.Done():
			return ctx.Err()
		}
		w.mu.Lock()
	}
	if w.state == StateRestarting {
		doneCh := w.restartDone
		w.mu.Unlock()
		if doneCh != nil {
			select {
			case <-doneCh:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		w.mu.Lock()
	}
	if w.state != StateRunning {
		w.mu.Unlock()
		// The backend isn't running, but a zero-cache may be (its lifecycle is
		// independent — /zero/* can spawn it without ever starting the backend).
		w.stopZeroCache(ctx)
		return nil
	}
	w.state = StateStopping
	bk := w.active
	w.mu.Unlock()

	if bk != nil && bk.cmd != nil && bk.cmd.Process != nil {
		signalBackend(bk, syscall.SIGTERM, w.Name)
		select {
		case <-bk.exitCh:
		case <-time.After(w.cfg.ShutdownGrace):
			signalBackend(bk, syscall.SIGKILL, w.Name)
			waitBackendExit(bk, w.Name, postKillTimeout)
		}
	}

	if bk != nil {
		_ = removeBackendArtifacts(bk.socketPath)
	}
	w.mu.Lock()
	w.active = nil
	w.state = StateIdle
	w.mu.Unlock()

	// Tear down the zero-cache alongside the backend on idle/unregister. Its
	// slot+replica reclamation is TS-owned; the gateway only kills the process.
	w.stopZeroCache(ctx)

	slog.Info("backend stopped", "worktree", w.Name)
	return nil
}

// ─── zero-cache sidecar lifecycle ────────────────────────────

// zeroReadyTimeout bounds the wait for the zero-cache to accept connections.
// The initial logical COPY can take several seconds on a fresh fork, so this is
// generous compared to the backend's readiness timeout.
const zeroReadyTimeout = 60 * time.Second

// EnsureZeroCache lazily cold-starts the worktree's zero-cache sidecar and
// returns it, mirroring Ensure/startBackend. Concurrent /zero/* callers are
// single-flighted by zeroMu so only one process is ever spawned. If the spec
// carries no zeroCache block, returns ErrZeroCacheDisabled (caller → 404).
func (w *Worktree) EnsureZeroCache(ctx context.Context) (*zeroCache, error) {
	spec := w.Spec()
	if spec.ZeroCache == nil {
		return nil, ErrZeroCacheDisabled
	}

	w.zeroMu.Lock()
	defer w.zeroMu.Unlock()

	// Fast path: an already-running sidecar (re-check under the single-flight
	// lock so a racing caller that just spawned it is observed).
	w.mu.Lock()
	if zc := w.activeZero; zc != nil {
		w.mu.Unlock()
		return zc, nil
	}
	w.mu.Unlock()

	zc, err := w.startZeroCache(spec.ZeroCache)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSpawnFailed, err)
	}

	readyErr := waitZeroReady(zc.port, zeroReadyTimeout, zc.exitCh)
	if readyErr != nil {
		if zc.cmd != nil && zc.cmd.Process != nil {
			signalZero(zc, syscall.SIGKILL, w.Name)
			waitZeroExit(zc, w.Name, postKillTimeout)
		}
		_ = os.Remove(zc.pidPath)
		w.mu.Lock()
		if w.activeZero == zc {
			w.activeZero = nil
		}
		w.mu.Unlock()
		wrapped := fmt.Errorf("%w: %v", ErrSpawnFailed, readyErr)
		slog.Warn("zero-cache spawn failed", "worktree", w.Name, "err", wrapped)
		return nil, wrapped
	}

	zc.proxy = newZeroReverseProxy(zc.port)
	slog.Info("zero-cache ready", "worktree", w.Name, "port", zc.port)
	return zc, nil
}

// startZeroCache allocates a loopback port, spawns the zero-cache command with
// the env contract, writes the pid sidecar, and registers the process on the
// worktree. Returns a *zeroCache with cmd/exitCh/port populated; proxy is nil
// until the caller confirms readiness. The exit goroutine clears activeZero so
// a crashed sidecar is re-spawned on the next /zero/* request.
func (w *Worktree) startZeroCache(spec *ZeroCacheSpec) (*zeroCache, error) {
	if len(spec.Command) == 0 {
		return nil, errors.New("zeroCache.command is empty")
	}

	port, err := allocLoopbackPort()
	if err != nil {
		return nil, fmt.Errorf("allocate zero-cache port: %w", err)
	}

	replicaFile := w.zeroReplicaPath()
	pidPath := w.zeroPidPath()

	cmd := exec.Command(spec.Command[0], spec.Command[1:]...)
	cmd.Dir = spec.Cwd
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("ZERO_UPSTREAM_DB=%s", spec.UpstreamDb),
		fmt.Sprintf("ZERO_PORT=%d", port),
		fmt.Sprintf("ZERO_REPLICA_FILE=%s", replicaFile),
		fmt.Sprintf("SINGULARITY_WORKTREE=%s", w.Name),
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	marker := fmt.Sprintf("--- starting %s zero-cache (port %d) ---", w.Name, port)
	fmt.Fprintf(w.logFile, "%s [gateway] %s\n", now.Format(time.RFC3339), marker)
	w.logBuf.Append("gateway", marker, now.UnixMilli())
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	zc := &zeroCache{
		cmd:     cmd,
		exitCh:  make(chan struct{}),
		port:    port,
		pidPath: pidPath,
	}

	// Durable pid sidecar so a future gateway generation can reap this
	// sidecar at boot if we die before stopping it. Best-effort.
	if err := writeZeroSidecar(pidPath, w.Name, cmd); err != nil {
		slog.Warn("write zero-cache pid sidecar failed", "worktree", w.Name, "path", pidPath, "err", err)
	}

	// Publish before readiness so Stop can find and kill it mid-startup.
	w.mu.Lock()
	w.activeZero = zc
	w.mu.Unlock()

	log := slog.With("worktree", w.Name, "pid", cmd.Process.Pid, "port", port)
	go pumpLog(stdout, "zero-stdout", w.logBuf, w.logFile)
	go pumpLog(stderr, "zero-stderr", w.logBuf, w.logFile)
	go func() {
		err := cmd.Wait()
		w.onZeroExit(zc, err)
		close(zc.exitCh)
	}()
	log.Info("zero-cache spawned")
	return zc, nil
}

// onZeroExit clears activeZero if the exiting sidecar is the current one, so a
// crashed zero-cache is re-spawned on the next /zero/* request.
func (w *Worktree) onZeroExit(zc *zeroCache, err error) {
	w.mu.Lock()
	isActive := (w.activeZero == zc)
	w.mu.Unlock()
	if !isActive {
		return
	}
	slog.Warn("zero-cache exited", "worktree", w.Name, "err", err)
	_ = os.Remove(zc.pidPath)
	w.mu.Lock()
	if w.activeZero == zc {
		w.activeZero = nil
	}
	w.mu.Unlock()
}

// stopZeroCache terminates the worktree's zero-cache process group (SIGTERM →
// grace → SIGKILL) and removes its pid sidecar. The gateway does NOT touch
// Postgres or the replica file — only the process. Idempotent.
func (w *Worktree) stopZeroCache(ctx context.Context) {
	w.mu.Lock()
	zc := w.activeZero
	w.activeZero = nil
	w.mu.Unlock()
	if zc == nil {
		return
	}
	if zc.cmd != nil && zc.cmd.Process != nil {
		signalZero(zc, syscall.SIGTERM, w.Name)
		select {
		case <-zc.exitCh:
		case <-time.After(w.cfg.ShutdownGrace):
			signalZero(zc, syscall.SIGKILL, w.Name)
			waitZeroExit(zc, w.Name, postKillTimeout)
		}
	}
	if err := os.Remove(zc.pidPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		slog.Warn("remove zero-cache pid sidecar failed", "worktree", w.Name, "path", zc.pidPath, "err", err)
	}
	slog.Info("zero-cache stopped", "worktree", w.Name)
}

// zeroReplicaPath is the per-worktree SQLite replica path the gateway hands the
// sidecar via ZERO_REPLICA_FILE. RegistryDir is <dataDir>/worktrees, so the
// per-worktree dir is <RegistryDir>/<name> — the same base spec.json lives in.
// The gateway never reads or drops this file; start.ts creates the parent dir.
func (w *Worktree) zeroReplicaPath() string {
	return filepath.Join(w.cfg.RegistryDir, w.Name, "zero", "replica.db")
}

// zeroPidPath is the sidecar's durable pid record, a plain file (no sun_path
// length concern — the sidecar uses a TCP port, not a socket).
func (w *Worktree) zeroPidPath() string {
	return filepath.Join(w.cfg.SocketsDir, w.Name+".zero.pid")
}

// TouchBackend resets the idle timer. Called after every backend-bound request.
func (w *Worktree) TouchBackend() {
	w.mu.Lock()
	w.lastActivity = time.Now()
	w.mu.Unlock()
}

// Snapshot returns a consistent view of the worktree state for /gateway/worktrees.
func (w *Worktree) Snapshot() WorktreeStatus {
	w.mu.Lock()
	state := w.state
	last := w.lastActivity
	bk := w.active
	w.mu.Unlock()
	spec := w.Spec()
	var socketPath string
	var conns int
	if bk != nil {
		socketPath = bk.socketPath
		conns = bk.conns()
	}
	return WorktreeStatus{
		Name:         w.Name,
		State:        state.String(),
		SocketPath:   socketPath,
		LastActivity: last,
		ActiveConns:  conns,
		Server:       spec.Server,
		Web:          spec.Web,
	}
}

// ShouldSweep reports whether the sweeper should tear this worktree down now.
// The decision lives on Worktree because it touches private state.
func (w *Worktree) ShouldSweep(idleTimeout time.Duration) bool {
	// `central` is a singleton runtime that owns heavyweight state (the
	// embedded Postgres cluster, secrets keychain, leader-elected
	// notifications). Tearing it down on idle forces a PG restart cycle —
	// every per-worktree backend's pool then sees the postmaster die and
	// retries land in the WAL-recovery window with `57P03 the database
	// system is starting up`. Pin it so it lives until gateway shutdown.
	// Same magic name as `central-routes.json`'s `"backend": "central"`.
	if w.Name == "central" {
		return false
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	// Sweep when the worktree has been idle past the timeout AND either the
	// backend or a zero-cache sidecar is still alive holding resources. A
	// zero-cache can outlive its backend (e.g. backend idled out first), so a
	// lone sidecar must still be reapable — Stop tears down both.
	if w.state != StateRunning && w.activeZero == nil {
		return false
	}
	if w.active != nil && w.active.conns() > 0 {
		return false
	}
	return time.Since(w.lastActivity) >= idleTimeout
}

// ─── internal helpers ────────────────────────────────────────

// startBackend builds and starts a backend process on the given socketPath.
// Returns a *backend with cmd and exitCh populated; proxy is nil until the
// caller confirms readiness and calls newReverseProxy.
func (w *Worktree) startBackend(spec *Spec, socketPath string) (*backend, error) {
	// Clear any stale socket + pid sidecar a crashed predecessor left on this path.
	if err := removeBackendArtifacts(socketPath); err != nil {
		return nil, fmt.Errorf("unlink stale socket: %w", err)
	}

	argv := spec.Command
	if len(argv) == 0 {
		argv = []string{"bun", "bin/index.ts"}
	}
	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Dir = spec.Server
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("SOCKET_PATH=%s", socketPath),
		fmt.Sprintf("SINGULARITY_WORKTREE=%s", w.Name),
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	marker := fmt.Sprintf("--- starting %s ---", w.Name)
	fmt.Fprintf(w.logFile, "%s [gateway] %s\n", now.Format(time.RFC3339), marker)
	w.logBuf.Append("gateway", marker, now.UnixMilli())
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	// Record a durable pid sidecar next to the socket so a future gateway
	// generation can reap this backend if we die before stopping it. Best-effort:
	// a missing sidecar degrades to the reconcile's "live, no record" branch.
	if err := writeBackendSidecar(socketPath, w.Name, cmd); err != nil {
		slog.Warn("write pid sidecar failed", "worktree", w.Name, "socket", socketPath, "err", err)
	}

	bk := &backend{
		cmd:        cmd,
		exitCh:     make(chan struct{}),
		socketPath: socketPath,
	}
	log := slog.With("worktree", w.Name, "pid", cmd.Process.Pid, "socket", socketPath)
	go pumpLog(stdout, "stdout", w.logBuf, w.logFile)
	go pumpLog(stderr, "stderr", w.logBuf, w.logFile)
	go func() {
		err := cmd.Wait()
		w.onBackendExit(bk, err)
		close(bk.exitCh)
	}()
	log.Info("backend spawned")
	return bk, nil
}

// onBackendExit is invoked from the cmd.Wait goroutine. It only transitions
// state if the exiting backend is the currently active one — a draining old
// backend from a hot restart is silently ignored.
func (w *Worktree) onBackendExit(bk *backend, err error) {
	w.mu.Lock()
	isActive := (w.active == bk)
	state := w.state
	w.mu.Unlock()

	if !isActive {
		return
	}

	if state == StateStopping {
		return
	}

	slog.Warn("backend exited unexpectedly", "worktree", w.Name, "err", err)
	_ = removeBackendArtifacts(bk.socketPath)

	w.mu.Lock()
	defer w.mu.Unlock()
	if w.active != bk {
		return
	}
	w.active = nil
	w.state = StateIdle
}

// waitReady polls the backend's `GET /api/health/ready` over its Unix socket
// until the backend reports ready, exits, or the deadline expires. This gates
// the hot-swap on genuine readiness (migrations applied, DB warm, registry
// built) rather than a bare socket accept — the old backend keeps serving until
// the new one can actually handle requests.
//
//   - 200 → ready.
//   - 404 → endpoint absent (backend predates this change); fall back to
//     "HTTP-reachable = ready" so older worktrees still start.
//   - 503 / transport error (socket still coming up) → not ready yet; keep polling.
func waitReady(socketPath string, timeout time.Duration, exitCh <-chan struct{}) error {
	client := &http.Client{
		Timeout: 2 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", socketPath)
			},
		},
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := client.Get("http://backend/api/health/ready")
		if err == nil {
			status := resp.StatusCode
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			if status == http.StatusOK || status == http.StatusNotFound {
				return nil
			}
		}
		select {
		case <-exitCh:
			return errors.New("backend exited before ready")
		case <-time.After(100 * time.Millisecond):
		}
	}
	return fmt.Errorf("readiness timeout after %s", timeout)
}

// killPgid sends a signal to a whole process group (negative pid), so backends
// that spawn children (like terminal PTYs) clean up too. The backend is the
// group leader (spawned with Setpgid), so pgid == its pid.
func killPgid(pgid int, sig syscall.Signal) error {
	return syscall.Kill(-pgid, sig)
}

// killGroup signals the process group of cmd.
func killGroup(cmd *exec.Cmd, sig syscall.Signal) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return killPgid(cmd.Process.Pid, sig)
}

// signalBackend sends sig to the backend's process group and logs any error
// other than ESRCH (the process is already gone — a benign no-op). Callers
// proceed to wait on exitCh regardless.
func signalBackend(bk *backend, sig syscall.Signal, worktree string) {
	if err := killGroup(bk.cmd, sig); err != nil && !errors.Is(err, syscall.ESRCH) {
		slog.Warn("signal backend failed",
			"worktree", worktree, "signal", sig.String(), "pid", backendPID(bk), "err", err)
	}
}

// waitBackendExit blocks until the backend's cmd.Wait goroutine closes exitCh,
// bounded by timeout. Without the bound, a kill that never lands would hang the
// caller forever; we cap it and log loudly so the leak is visible.
func waitBackendExit(bk *backend, worktree string, timeout time.Duration) {
	select {
	case <-bk.exitCh:
	case <-time.After(timeout):
		slog.Error("backend did not exit after SIGKILL; possible leak",
			"worktree", worktree, "socket", bk.socketPath, "pid", backendPID(bk))
	}
}

// backendPID returns the backend's pid for logging, or -1 if unknown.
func backendPID(bk *backend) int {
	if bk == nil || bk.cmd == nil || bk.cmd.Process == nil {
		return -1
	}
	return bk.cmd.Process.Pid
}

// processAlive reports whether pid names a live process (signal-0 probe).
// EPERM means it exists but we can't signal it (still "alive"); ESRCH means gone.
func processAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

// reapPgid terminates an orphaned backend's process group: SIGTERM, wait up to
// grace for the leader to vanish, then SIGKILL. ESRCH at any step is success
// (already gone). Used by the boot reconcile, which knows only the sidecar pid.
func reapPgid(pgid, leaderPid int, grace time.Duration, label string) {
	if !processAlive(leaderPid) {
		return
	}
	if err := killPgid(pgid, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
		slog.Warn("orphan SIGTERM failed", "label", label, "pgid", pgid, "err", err)
	}
	deadline := time.Now().Add(grace)
	for time.Now().Before(deadline) {
		if !processAlive(leaderPid) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	if !processAlive(leaderPid) {
		return
	}
	if err := killPgid(pgid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
		slog.Error("orphan SIGKILL failed; possible leak", "label", label, "pgid", pgid, "err", err)
	}
}

// ─── backend pid sidecar ─────────────────────────────────────
//
// A small durable record written next to each socket at spawn so the gateway's
// ownership of a backend survives its own restart. The socket file's presence
// is the trigger for reconcile; the sidecar carries the pid to reap.

type backendSidecar struct {
	PID       int    `json:"pid"`
	PGID      int    `json:"pgid"`
	WallStart string `json:"wallStart"`
	Worktree  string `json:"worktree"`
}

func sidecarPath(socketPath string) string { return socketPath + ".pid" }

// writeBackendSidecar atomically writes the pid record for a freshly-spawned
// backend. pgid == pid because the backend is its own group leader (Setpgid).
func writeBackendSidecar(socketPath, worktree string, cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return errors.New("no process to record")
	}
	pid := cmd.Process.Pid
	data, err := json.Marshal(backendSidecar{
		PID:       pid,
		PGID:      pid,
		WallStart: time.Now().UTC().Format(time.RFC3339),
		Worktree:  worktree,
	})
	if err != nil {
		return err
	}
	tmp := sidecarPath(socketPath) + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, sidecarPath(socketPath))
}

// readBackendSidecar reads and validates the pid record for a socket.
func readBackendSidecar(socketPath string) (*backendSidecar, error) {
	data, err := os.ReadFile(sidecarPath(socketPath))
	if err != nil {
		return nil, err
	}
	var sc backendSidecar
	if err := json.Unmarshal(data, &sc); err != nil {
		return nil, err
	}
	if sc.PID <= 0 || sc.PGID <= 0 {
		return nil, fmt.Errorf("invalid sidecar: pid=%d pgid=%d", sc.PID, sc.PGID)
	}
	return &sc, nil
}

// removeBackendArtifacts removes a backend's socket file then its pid sidecar.
// Socket-first is crash-safe: a leftover sidecar with no socket is reaped by the
// reconcile's dial gate, whereas a leftover socket with no sidecar degrades to
// the recoverable "live, no record" branch. Missing files are not an error;
// only a socket-removal failure (which would block a rebind) is returned.
func removeBackendArtifacts(socketPath string) error {
	sockErr := os.Remove(socketPath)
	if sockErr != nil && errors.Is(sockErr, os.ErrNotExist) {
		sockErr = nil
	}
	if err := os.Remove(sidecarPath(socketPath)); err != nil && !errors.Is(err, os.ErrNotExist) {
		slog.Warn("remove pid sidecar failed", "path", sidecarPath(socketPath), "err", err)
	}
	return sockErr
}

// newReverseProxy builds a reverse proxy that dials the backend's Unix socket.
// The URL Host is a placeholder — the custom Transport ignores Dial address
// args and always dials socketPath. socketPath is captured by value so the
// closure stays bound to the path at construction time.
func newReverseProxy(socketPath string) *httputil.ReverseProxy {
	target := &url.URL{Scheme: "http", Host: "backend"}
	rp := httputil.NewSingleHostReverseProxy(target)
	rp.Transport = &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", socketPath)
		},
	}
	origDirector := rp.Director
	rp.Director = func(r *http.Request) {
		origDirector(r)
		r.Host = target.Host
	}
	rp.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Warn("reverse proxy error", "err", err)
		http.Error(w, "backend unavailable: "+err.Error(), http.StatusBadGateway)
	}
	return rp
}

// ─── zero-cache helpers ──────────────────────────────────────

// allocLoopbackPort binds 127.0.0.1:0, reads back the kernel-assigned port, and
// closes the listener — returning a free loopback port for the zero-cache to
// rebind. There is a small TOCTOU window between close and the child's bind;
// the child binds immediately on start, so in practice it is benign.
func allocLoopbackPort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	port := l.Addr().(*net.TCPAddr).Port
	if err := l.Close(); err != nil {
		return 0, err
	}
	return port, nil
}

// waitZeroReady polls a TCP connect to 127.0.0.1:<port> until the zero-cache
// accepts connections, the process exits, or the deadline expires. zero-cache
// has no readiness endpoint we depend on, so a completed connect is the gate.
func waitZeroReady(port int, timeout time.Duration, exitCh <-chan struct{}) error {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		c, err := net.DialTimeout("tcp", addr, 1*time.Second)
		if err == nil {
			_ = c.Close()
			return nil
		}
		select {
		case <-exitCh:
			return errors.New("zero-cache exited before ready")
		case <-time.After(200 * time.Millisecond):
		}
	}
	return fmt.Errorf("zero-cache readiness timeout after %s", timeout)
}

// signalZero sends sig to the zero-cache's process group, ESRCH-tolerant.
func signalZero(zc *zeroCache, sig syscall.Signal, worktree string) {
	if err := killGroup(zc.cmd, sig); err != nil && !errors.Is(err, syscall.ESRCH) {
		slog.Warn("signal zero-cache failed",
			"worktree", worktree, "signal", sig.String(), "pid", zeroPID(zc), "err", err)
	}
}

// waitZeroExit blocks until the zero-cache's cmd.Wait goroutine closes exitCh,
// bounded by timeout, logging loudly if the kill never lands.
func waitZeroExit(zc *zeroCache, worktree string, timeout time.Duration) {
	select {
	case <-zc.exitCh:
	case <-time.After(timeout):
		slog.Error("zero-cache did not exit after SIGKILL; possible leak",
			"worktree", worktree, "port", zc.port, "pid", zeroPID(zc))
	}
}

// zeroPID returns the zero-cache's pid for logging, or -1 if unknown.
func zeroPID(zc *zeroCache) int {
	if zc == nil || zc.cmd == nil || zc.cmd.Process == nil {
		return -1
	}
	return zc.cmd.Process.Pid
}

// newZeroReverseProxy builds a reverse proxy that dials the zero-cache over
// loopback TCP. The leading /zero prefix is stripped before forwarding, since
// zero-cache mounts its routes at root (/sync, /keepalive, /) with no base path.
func newZeroReverseProxy(port int) *httputil.ReverseProxy {
	target := &url.URL{Scheme: "http", Host: fmt.Sprintf("127.0.0.1:%d", port)}
	rp := httputil.NewSingleHostReverseProxy(target)
	origDirector := rp.Director
	rp.Director = func(r *http.Request) {
		origDirector(r)
		stripZeroPrefix(r.URL)
		r.Host = target.Host
	}
	rp.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Warn("zero-cache proxy error", "err", err)
		http.Error(w, "zero-cache unavailable: "+err.Error(), http.StatusBadGateway)
	}
	return rp
}

// stripZeroPrefix rewrites a request URL path so the /zero prefix zero-cache
// never sees is removed: /zero/foo → /foo, /zero → /.
func stripZeroPrefix(u *url.URL) {
	rest := strings.TrimPrefix(u.Path, "/zero")
	if rest == "" {
		rest = "/"
	}
	u.Path = rest
	if u.RawPath != "" {
		u.RawPath = strings.TrimPrefix(u.RawPath, "/zero")
		if u.RawPath == "" {
			u.RawPath = "/"
		}
	}
}

// ─── zero-cache pid sidecar ──────────────────────────────────
//
// Mirrors the backend sidecar so the boot reconcile can reap an orphaned
// zero-cache from a prior gateway generation. The pid file is a plain file at
// <SocketsDir>/<name>.zero.pid (no socket, no sun_path length concern).

func writeZeroSidecar(pidPath, worktree string, cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return errors.New("no process to record")
	}
	pid := cmd.Process.Pid
	data, err := json.Marshal(backendSidecar{
		PID:       pid,
		PGID:      pid,
		WallStart: time.Now().UTC().Format(time.RFC3339),
		Worktree:  worktree,
	})
	if err != nil {
		return err
	}
	tmp := pidPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, pidPath)
}

func readZeroSidecar(pidPath string) (*backendSidecar, error) {
	data, err := os.ReadFile(pidPath)
	if err != nil {
		return nil, err
	}
	var sc backendSidecar
	if err := json.Unmarshal(data, &sc); err != nil {
		return nil, err
	}
	if sc.PID <= 0 || sc.PGID <= 0 {
		return nil, fmt.Errorf("invalid zero sidecar: pid=%d pgid=%d", sc.PID, sc.PGID)
	}
	return &sc, nil
}

// pumpLog forwards one of a backend's output streams to the worktree's own log
// channel: the durable per-worktree file plus the in-memory ring that feeds the
// live UI. Backend output stays out of the gateway's own log — each is its own
// channel.
func pumpLog(r io.ReadCloser, stream string, ring *logRing, file io.Writer) {
	defer r.Close()
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 4096), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		now := time.Now()
		fmt.Fprintf(file, "%s [%s] %s\n", now.Format(time.RFC3339), stream, line)
		if ring != nil {
			ring.Append(stream, line, now.UnixMilli())
		}
	}
}
