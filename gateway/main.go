package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

// Config holds all gateway settings, parsed from command-line flags.
type Config struct {
	Listen            string
	IdleTimeout       time.Duration
	ShutdownGrace     time.Duration
	ReadyTimeout      time.Duration
	ReadyTimeoutMax   time.Duration
	SweepInterval     time.Duration
	ReconcileInterval time.Duration
	BrokenCooldown    time.Duration
	LogLevel          string
	LogFormat         string
	LogBufferLines    int
	LogDir            string
	RegistryDir       string
	SocketsDir        string
	CentralRoutesFile string
	DefaultNamespace  string
}

func parseFlags() Config {
	var cfg Config
	flag.StringVar(&cfg.Listen, "listen", ":9000", "address to listen on")
	flag.DurationVar(&cfg.IdleTimeout, "idle-timeout", 10*time.Minute, "backend idle timeout")
	flag.DurationVar(&cfg.ShutdownGrace, "shutdown-grace", 5*time.Second, "grace period before SIGKILL")
	flag.DurationVar(&cfg.ReadyTimeout, "ready-timeout", 15*time.Second, "max wait for backend readiness")
	flag.DurationVar(&cfg.ReadyTimeoutMax, "ready-timeout-max", 90*time.Second, "ceiling for the load-adaptive backend readiness timeout; also the extra wait granted when a slow-but-alive boot escalates instead of being killed")
	flag.DurationVar(&cfg.SweepInterval, "sweep-interval", 30*time.Second, "idle sweeper tick")
	flag.DurationVar(&cfg.ReconcileInterval, "reconcile-interval", 10*time.Second, "registry-dir reconcile tick (registers worktrees the fsnotify watch missed, unregisters vanished ones)")
	flag.DurationVar(&cfg.BrokenCooldown, "broken-cooldown", 10*time.Second, "wait before retrying a failed spawn")
	flag.StringVar(&cfg.LogLevel, "log-level", "info", "log level: debug|info|warn|error")
	flag.StringVar(&cfg.LogFormat, "log-format", "text", "log format: text|json")
	flag.IntVar(&cfg.LogBufferLines, "log-buffer-lines", 1000, "per-worktree backend log ring capacity")

	dataDir := os.Getenv("SINGULARITY_DIR")
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".singularity")
	}
	defaultLogDir := filepath.Join(dataDir, "logs")
	flag.StringVar(&cfg.LogDir, "log-dir", defaultLogDir, "directory for the gateway and per-worktree log files")
	defaultRegistry := filepath.Join(dataDir, "worktrees")
	flag.StringVar(&cfg.RegistryDir, "registry-dir", defaultRegistry, "directory of worktree JSON files")
	defaultSockets := os.Getenv("SINGULARITY_SOCKETS_DIR")
	if defaultSockets == "" {
		defaultSockets = filepath.Join(dataDir, "sockets")
	}
	flag.StringVar(&cfg.SocketsDir, "sockets-dir", defaultSockets, "directory for per-worktree Unix sockets (env: SINGULARITY_SOCKETS_DIR; short /tmp dir for deep release roots)")
	defaultCentralRoutes := filepath.Join(dataDir, "central-routes.json")
	flag.StringVar(&cfg.CentralRoutesFile, "central-routes-file", defaultCentralRoutes, "path to the central routing manifest")
	// Fallback namespace for subdomain-less requests. Empty ⇒ such requests 404
	// (dev/multi-app). A packaged single-app build (desktop/Tauri, single-origin
	// web) sets it to the app's name so a bare-localhost webview reaches the
	// backend. Env-defaulted so the release launcher can pass it through inherited
	// process env as well as the flag.
	flag.StringVar(&cfg.DefaultNamespace, "default-namespace", os.Getenv("SINGULARITY_DEFAULT_NAMESPACE"), "fallback namespace for requests with no subdomain")

	flag.Parse()
	return cfg
}

func setupLogging(cfg Config) {
	var level slog.Level
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: level}
	// The gateway's own logs are their own channel: a rotating gateway.log,
	// separate from each worktree backend's <name>.log. Per-process stdout/stderr
	// (Go panics, pre-logging crashes) is captured separately by the launcher.
	out := newRotatingWriter(filepath.Join(cfg.LogDir, "gateway.log"), maxLogBytes, maxLogBackups)
	var h slog.Handler
	if cfg.LogFormat == "json" {
		h = slog.NewJSONHandler(out, opts)
	} else {
		h = slog.NewTextHandler(out, opts)
	}
	slog.SetDefault(slog.New(h))
}

func main() {
	cfg := parseFlags()
	setupLogging(cfg)

	if err := os.MkdirAll(cfg.SocketsDir, 0o755); err != nil {
		slog.Error("create sockets dir failed", "err", err, "dir", cfg.SocketsDir)
		os.Exit(1)
	}
	reg := NewRegistry(&cfg)
	if err := reg.LoadAll(); err != nil {
		slog.Error("registry load failed", "err", err)
		os.Exit(1)
	}
	// Reap orphan backends left by a prior gateway generation. MUST run here —
	// after the registry is loaded but BEFORE the watcher/sweep goroutines and
	// the eager-central spawn below — because it relies on the gateway having
	// spawned zero backends yet (so any live socket is a prior-generation
	// orphan). Do not move it after anything that can start a backend.
	reconcileOrphanBackends(cfg.SocketsDir, reg)

	routes := NewCentralRoutesStore(cfg.CentralRoutesFile)
	dataDir := os.Getenv("SINGULARITY_DIR")
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".singularity")
	}
	dbConfigPath := filepath.Join(dataDir, "database.json")
	sup, err := NewSupervisor(dbConfigPath)
	if err != nil {
		slog.Error("supervisor: failed to load config; continuing without services", "err", err)
		sup = &Supervisor{}
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	go func() {
		if err := reg.Watch(ctx); err != nil {
			slog.Error("watcher exited with error", "err", err)
		}
	}()
	go func() {
		if err := routes.Watch(ctx); err != nil {
			slog.Error("central routes watcher exited with error", "err", err)
		}
	}()
	go reg.Sweep(ctx)
	// Periodic backstop for registry drift the fsnotify watch can miss under
	// watch-FD pressure (thousands of worktree dirs). Registers worktrees whose
	// spec.json appeared without a delivered event; unregisters vanished ones.
	go reg.Reconcile(ctx)

	// Start supervised services (e.g. embedded Postgres) before backends.
	// Backends assume services are reachable; the supervisor must bring them
	// up first. If a service fails, log loudly but keep serving —
	// /gateway/services will show the failure so operators can tell.
	if err := sup.StartAll(ctx); err != nil {
		slog.Error("supervisor: start failed; continuing without managed services", "err", err)
	}

	// Eagerly spawn `central` so plugins that load on boot (auth, secrets) are
	// ready before the first request lands. PG is up by this point, so
	// central's plugins can connect immediately.
	if wt := reg.Get("central"); wt != nil {
		go func() {
			if _, err := wt.Ensure(ctx); err != nil {
				slog.Warn("eager central spawn failed", "err", err)
			}
		}()
	}

	srv := &http.Server{
		Addr:              cfg.Listen,
		Handler:           NewProxy(reg, routes, sup, cfg.DefaultNamespace),
		ReadHeaderTimeout: 10 * time.Second,
	}

	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		logSigtermSender()
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer shutCancel()
		_ = srv.Shutdown(shutCtx)
		_ = reg.StopAll(shutCtx)
		// Clears watchdog goroutines; services keep running as daemons.
		sup.StopAll()
	}()

	slog.Info("gateway listening", "addr", cfg.Listen, "registry-dir", cfg.RegistryDir, "sockets-dir", cfg.SocketsDir)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
	// Block until the shutdown goroutine finishes stopping all backends.
	// srv.Shutdown returns ErrServerClosed immediately, not when done, so
	// without this wait main returns and the process exits mid-StopAll —
	// leaving bun children reparented to init instead of terminated.
	<-shutdownDone
	slog.Info("gateway stopped")
}
