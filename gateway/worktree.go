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
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// State is the lifecycle state of a worktree's backend process.
type State int

const (
	StateIdle State = iota
	StateStarting
	StateRunning
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
	Port         int       `json:"port"`
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

// Worktree owns one backend's lifecycle: spawn, supervise, proxy, idle teardown.
type Worktree struct {
	Name string

	pool *PortPool
	cfg  *Config

	// spec is replaced atomically on file change. Lock-free reads.
	spec atomic.Pointer[Spec]

	// All other fields below are guarded by mu.
	mu           sync.Mutex
	state        State
	port         int
	cmd          *exec.Cmd
	exitCh       chan struct{} // closed when cmd.Wait returns
	proxy        *httputil.ReverseProxy
	lastActivity time.Time
	activeConns  int
	brokenUntil  time.Time
	readyCh      chan struct{} // signal-only; waiters re-check state
	lastSpawnErr error
}

func NewWorktree(name string, spec *Spec, pool *PortPool, cfg *Config) *Worktree {
	w := &Worktree{
		Name: name,
		pool: pool,
		cfg:  cfg,
	}
	w.spec.Store(spec)
	return w
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

// Ensure starts the backend if needed and returns a ready ReverseProxy.
// Concurrent callers share a single in-flight spawn via readyCh.
func (w *Worktree) Ensure(ctx context.Context) (*httputil.ReverseProxy, error) {
	w.mu.Lock()

	switch w.state {
	case StateRunning:
		p := w.proxy
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
	port, err := w.pool.Acquire()
	if err != nil {
		w.mu.Unlock()
		return nil, err
	}
	w.state = StateStarting
	w.port = port
	w.readyCh = make(chan struct{})
	w.lastSpawnErr = nil
	readyCh := w.readyCh
	spec := w.Spec()
	w.mu.Unlock()

	// Run the spawn outside the lock so concurrent callers see Starting and wait.
	cmd, exitCh, spawnErr := w.startBackend(spec, port)
	if spawnErr == nil {
		// Make cmd visible so Stop can find it before readiness completes.
		w.mu.Lock()
		w.cmd = cmd
		w.exitCh = exitCh
		w.mu.Unlock()
		spawnErr = waitReady(port, w.cfg.ReadyTimeout, exitCh)
	}

	if spawnErr != nil {
		wrapped := fmt.Errorf("%w: %v", ErrSpawnFailed, spawnErr)
		// Kill if the process started; wait for the exit goroutine to close exitCh.
		if cmd != nil && cmd.Process != nil {
			killGroup(cmd, syscall.SIGKILL)
			<-exitCh
		}
		w.mu.Lock()
		w.pool.Release(port)
		w.port = 0
		w.cmd = nil
		w.exitCh = nil
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
	w.proxy = newReverseProxy(port)
	w.lastActivity = time.Now()
	p := w.proxy
	w.mu.Unlock()
	close(readyCh)
	slog.Info("backend ready", "worktree", w.Name, "port", port)
	return p, nil
}

func (w *Worktree) snapshotAfterSpawn() (*httputil.ReverseProxy, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.state == StateRunning {
		return w.proxy, nil
	}
	if w.lastSpawnErr != nil {
		return nil, w.lastSpawnErr
	}
	return nil, errors.New("spawn did not complete successfully")
}

// Stop performs a graceful shutdown: SIGTERM → grace → SIGKILL. Idempotent.
// If the worktree is currently spawning, Stop waits for the spawn to settle
// first to avoid racing the spawn cleanup path.
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
	if w.state != StateRunning {
		w.mu.Unlock()
		return nil
	}
	w.state = StateStopping
	cmd := w.cmd
	exitCh := w.exitCh
	port := w.port
	w.mu.Unlock()

	if cmd != nil && cmd.Process != nil {
		_ = killGroup(cmd, syscall.SIGTERM)
		select {
		case <-exitCh:
		case <-time.After(w.cfg.ShutdownGrace):
			_ = killGroup(cmd, syscall.SIGKILL)
			<-exitCh
		}
	}

	w.mu.Lock()
	w.pool.Release(port)
	w.cmd = nil
	w.exitCh = nil
	w.proxy = nil
	w.port = 0
	w.state = StateIdle
	w.activeConns = 0
	w.mu.Unlock()
	slog.Info("backend stopped", "worktree", w.Name, "port", port)
	return nil
}

// TouchBackend resets the idle timer. Called after every backend-bound request.
func (w *Worktree) TouchBackend() {
	w.mu.Lock()
	w.lastActivity = time.Now()
	w.mu.Unlock()
}

// IncConns marks a long-lived connection (WebSocket) as active. While
// activeConns > 0, the sweeper will not tear the backend down.
func (w *Worktree) IncConns() {
	w.mu.Lock()
	w.activeConns++
	w.lastActivity = time.Now()
	w.mu.Unlock()
}

func (w *Worktree) DecConns() {
	w.mu.Lock()
	if w.activeConns > 0 {
		w.activeConns--
	}
	w.lastActivity = time.Now()
	w.mu.Unlock()
}

// Snapshot returns a consistent view of the worktree state for /gateway/worktrees.
func (w *Worktree) Snapshot() WorktreeStatus {
	w.mu.Lock()
	state := w.state
	port := w.port
	last := w.lastActivity
	conns := w.activeConns
	w.mu.Unlock()
	spec := w.Spec()
	return WorktreeStatus{
		Name:         w.Name,
		State:        state.String(),
		Port:         port,
		LastActivity: last,
		ActiveConns:  conns,
		Server:       spec.Server,
		Web:          spec.Web,
	}
}

// ShouldSweep reports whether the sweeper should tear this worktree down now.
// The decision lives on Worktree because it touches private state.
func (w *Worktree) ShouldSweep(idleTimeout time.Duration) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.state != StateRunning {
		return false
	}
	if w.activeConns > 0 {
		return false
	}
	return time.Since(w.lastActivity) >= idleTimeout
}

// ─── internal helpers ────────────────────────────────────────

// startBackend builds and starts the backend process. On success, returns the
// running cmd and an exitCh that closes when cmd.Wait returns.
func (w *Worktree) startBackend(spec *Spec, port int) (*exec.Cmd, chan struct{}, error) {
	cmd := exec.Command("bun", "src/index.ts")
	cmd.Dir = spec.Server
	cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", port))
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, nil, err
	}

	exitCh := make(chan struct{})
	log := slog.With("worktree", w.Name, "pid", cmd.Process.Pid, "port", port)
	go pumpLog(stdout, log, "stdout")
	go pumpLog(stderr, log, "stderr")
	go func() {
		err := cmd.Wait()
		w.onProcExit(err)
		close(exitCh)
	}()
	log.Info("backend spawned")
	return cmd, exitCh, nil
}

// onProcExit is invoked from the cmd.Wait goroutine. It only acts if the
// worktree is in StateRunning — Starting and Stopping are handled by their
// respective callers, which ensure cleanup themselves.
func (w *Worktree) onProcExit(err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.state != StateRunning {
		return
	}
	slog.Warn("backend exited unexpectedly", "worktree", w.Name, "err", err)
	w.pool.Release(w.port)
	w.cmd = nil
	w.exitCh = nil
	w.proxy = nil
	w.port = 0
	w.state = StateIdle
	w.activeConns = 0
}

// waitReady polls the backend port with TCP dials until it accepts a
// connection or the deadline expires. If the process exits before becoming
// ready, returns immediately.
func waitReady(port int, timeout time.Duration, exitCh <-chan struct{}) error {
	deadline := time.Now().Add(timeout)
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 200*time.Millisecond)
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

func newReverseProxy(port int) *httputil.ReverseProxy {
	target := &url.URL{Scheme: "http", Host: fmt.Sprintf("127.0.0.1:%d", port)}
	rp := httputil.NewSingleHostReverseProxy(target)
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

func pumpLog(r io.ReadCloser, log *slog.Logger, stream string) {
	defer r.Close()
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 4096), 1024*1024)
	for scanner.Scan() {
		log.Info(scanner.Text(), "stream", stream)
	}
}
