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
	SweepInterval     time.Duration
	BrokenCooldown    time.Duration
	LogLevel          string
	LogFormat         string
	LogBufferLines    int
	RegistryDir       string
	SocketsDir        string
	CentralRoutesFile string
}

func parseFlags() Config {
	var cfg Config
	flag.StringVar(&cfg.Listen, "listen", ":9000", "address to listen on")
	flag.DurationVar(&cfg.IdleTimeout, "idle-timeout", 10*time.Minute, "backend idle timeout")
	flag.DurationVar(&cfg.ShutdownGrace, "shutdown-grace", 5*time.Second, "grace period before SIGKILL")
	flag.DurationVar(&cfg.ReadyTimeout, "ready-timeout", 15*time.Second, "max wait for backend readiness")
	flag.DurationVar(&cfg.SweepInterval, "sweep-interval", 30*time.Second, "idle sweeper tick")
	flag.DurationVar(&cfg.BrokenCooldown, "broken-cooldown", 10*time.Second, "wait before retrying a failed spawn")
	flag.StringVar(&cfg.LogLevel, "log-level", "info", "log level: debug|info|warn|error")
	flag.StringVar(&cfg.LogFormat, "log-format", "text", "log format: text|json")
	flag.IntVar(&cfg.LogBufferLines, "log-buffer-lines", 1000, "per-worktree backend log ring capacity")

	home, _ := os.UserHomeDir()
	defaultRegistry := filepath.Join(home, ".singularity", "worktrees")
	flag.StringVar(&cfg.RegistryDir, "registry-dir", defaultRegistry, "directory of worktree JSON files")
	defaultSockets := filepath.Join(home, ".singularity", "sockets")
	flag.StringVar(&cfg.SocketsDir, "sockets-dir", defaultSockets, "directory for per-worktree Unix sockets")
	defaultCentralRoutes := filepath.Join(home, ".singularity", "central-routes.json")
	flag.StringVar(&cfg.CentralRoutesFile, "central-routes-file", defaultCentralRoutes, "path to the central routing manifest")

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
	var h slog.Handler
	if cfg.LogFormat == "json" {
		h = slog.NewJSONHandler(os.Stderr, opts)
	} else {
		h = slog.NewTextHandler(os.Stderr, opts)
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
	sweepStaleSockets(cfg.SocketsDir, reg)

	routes := NewCentralRoutesStore(cfg.CentralRoutesFile)

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

	srv := &http.Server{
		Addr:              cfg.Listen,
		Handler:           NewProxy(reg, routes),
		ReadHeaderTimeout: 10 * time.Second,
	}

	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		slog.Info("shutdown signal received")
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer shutCancel()
		_ = srv.Shutdown(shutCtx)
		_ = reg.StopAll(shutCtx)
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
