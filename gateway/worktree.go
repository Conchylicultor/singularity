package main

import (
	"bufio"
	"context"
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
	Server string `json:"server"` // absolute path to the backend's working directory
	Web    string `json:"web"`    // absolute path to web/dist
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
	ErrBroken      = errors.New("worktree in broken cooldown")
	ErrSpawnFailed = errors.New("backend spawn failed")
	ErrStopping    = errors.New("worktree is stopping")
)

// backend groups the per-process fields for one running backend instance.
// A Worktree holds at most one active *backend; a second may exist briefly
// as the "draining" old backend during a hot restart.
type backend struct {
	cmd        *exec.Cmd
	exitCh     chan struct{} // closed when cmd.Wait returns
	socketPath string
	proxy      *httputil.ReverseProxy // nil until waitReady succeeds

	connMu      sync.Mutex
	activeConns int
}

func (b *backend) incConns() {
	b.connMu.Lock()
	b.activeConns++
	b.connMu.Unlock()
}

func (b *backend) decConns() {
	b.connMu.Lock()
	if b.activeConns > 0 {
		b.activeConns--
	}
	b.connMu.Unlock()
}

func (b *backend) conns() int {
	b.connMu.Lock()
	defer b.connMu.Unlock()
	return b.activeConns
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

// Ensure starts the backend if needed and returns a ready ReverseProxy.
// Concurrent callers share a single in-flight spawn via readyCh.
func (w *Worktree) Ensure(ctx context.Context) (*httputil.ReverseProxy, error) {
	w.mu.Lock()

	switch w.state {
	case StateRunning:
		p := w.active.proxy
		w.mu.Unlock()
		return p, nil

	case StateRestarting:
		// Old backend still serving — return its proxy for zero downtime.
		p := w.active.proxy
		w.mu.Unlock()
		return p, nil

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
		// Kill if the process started; wait for the exit goroutine to close exitCh.
		if bk != nil && bk.cmd != nil && bk.cmd.Process != nil {
			killGroup(bk.cmd, syscall.SIGKILL)
			<-bk.exitCh
		}
		if bk != nil {
			_ = os.Remove(bk.socketPath)
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
	p := bk.proxy
	w.mu.Unlock()
	close(readyCh)
	slog.Info("backend ready", "worktree", w.Name, "socket", socketPath)
	return p, nil
}

func (w *Worktree) snapshotAfterSpawn() (*httputil.ReverseProxy, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.state == StateRunning && w.active != nil {
		return w.active.proxy, nil
	}
	if w.lastSpawnErr != nil {
		return nil, w.lastSpawnErr
	}
	return nil, errors.New("spawn did not complete successfully")
}

const drainTimeout = 30 * time.Second

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
			_ = killGroup(newBk.cmd, syscall.SIGKILL)
			<-newBk.exitCh
		}
		if newBk != nil {
			_ = os.Remove(newBk.socketPath)
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

// drainAndStop waits for active WebSocket connections on bk to drain (up to
// drainTimeout), then signals and waits for the process to exit. Runs in a
// goroutine kicked off by Restart(); never modifies w.state.
func (w *Worktree) drainAndStop(bk *backend) {
	deadline := time.Now().Add(drainTimeout)
	for bk.conns() > 0 && time.Now().Before(deadline) {
		time.Sleep(200 * time.Millisecond)
	}
	if n := bk.conns(); n > 0 {
		slog.Warn("drain timeout; forcing stop with active WS connections",
			"worktree", w.Name, "activeConns", n)
	}
	if bk.cmd != nil && bk.cmd.Process != nil {
		_ = killGroup(bk.cmd, syscall.SIGTERM)
		select {
		case <-bk.exitCh:
		case <-time.After(w.cfg.ShutdownGrace):
			_ = killGroup(bk.cmd, syscall.SIGKILL)
			<-bk.exitCh
		}
	}
	_ = os.Remove(bk.socketPath)
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
		return nil
	}
	w.state = StateStopping
	bk := w.active
	w.mu.Unlock()

	if bk != nil && bk.cmd != nil && bk.cmd.Process != nil {
		_ = killGroup(bk.cmd, syscall.SIGTERM)
		select {
		case <-bk.exitCh:
		case <-time.After(w.cfg.ShutdownGrace):
			_ = killGroup(bk.cmd, syscall.SIGKILL)
			<-bk.exitCh
		}
	}

	if bk != nil {
		_ = os.Remove(bk.socketPath)
	}
	w.mu.Lock()
	w.active = nil
	w.state = StateIdle
	w.mu.Unlock()
	slog.Info("backend stopped", "worktree", w.Name)
	return nil
}

// TouchBackend resets the idle timer. Called after every backend-bound request.
func (w *Worktree) TouchBackend() {
	w.mu.Lock()
	w.lastActivity = time.Now()
	w.mu.Unlock()
}

// activeBackend returns the currently active backend, or nil. Called by
// handleWebSocket to capture the backend at connection time so the WS
// connection pins to that specific process.
func (w *Worktree) activeBackend() *backend {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.active
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
	if w.state != StateRunning {
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
	if err := os.Remove(socketPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("unlink stale socket: %w", err)
	}

	cmd := exec.Command("bun", "bin/index.ts")
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
	_ = os.Remove(bk.socketPath)

	w.mu.Lock()
	defer w.mu.Unlock()
	if w.active != bk {
		return
	}
	w.active = nil
	w.state = StateIdle
}

// waitReady polls the backend's Unix socket with dials until it accepts a
// connection or the deadline expires. If the process exits before becoming
// ready, returns immediately.
func waitReady(socketPath string, timeout time.Duration, exitCh <-chan struct{}) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("unix", socketPath, 200*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		select {
		case <-exitCh:
			return errors.New("backend exited before ready")
		case <-time.After(100 * time.Millisecond):
		}
	}
	return fmt.Errorf("readiness timeout after %s", timeout)
}

// killGroup sends a signal to the process group of cmd, so backends that
// spawn children (like terminal PTYs) clean up too.
func killGroup(cmd *exec.Cmd, sig syscall.Signal) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return syscall.Kill(-cmd.Process.Pid, sig)
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
