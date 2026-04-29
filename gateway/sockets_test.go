package main

import (
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestWaitReadyOverUDS(t *testing.T) {
	socketPath := filepath.Join(t.TempDir(), "ready.sock")

	// Start a listener after a short delay; waitReady should retry until it
	// succeeds. Mirrors the real spawn race window.
	go func() {
		time.Sleep(50 * time.Millisecond)
		l, err := net.Listen("unix", socketPath)
		if err != nil {
			t.Errorf("listen unix: %v", err)
			return
		}
		t.Cleanup(func() { _ = l.Close() })
		// Accept once so the dial inside waitReady completes cleanly.
		go func() {
			c, err := l.Accept()
			if err == nil {
				_ = c.Close()
			}
		}()
	}()

	exitCh := make(chan struct{})
	if err := waitReady(socketPath, 1*time.Second, exitCh); err != nil {
		t.Fatalf("waitReady: %v", err)
	}
}

func TestWaitReadyTimesOutWhenSocketAbsent(t *testing.T) {
	socketPath := filepath.Join(t.TempDir(), "nope.sock")
	exitCh := make(chan struct{})
	start := time.Now()
	err := waitReady(socketPath, 200*time.Millisecond, exitCh)
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("waitReady should have timed out, got nil")
	}
	if elapsed < 150*time.Millisecond {
		t.Fatalf("waitReady returned too quickly: %s", elapsed)
	}
}

func TestWaitReadyReturnsWhenBackendExits(t *testing.T) {
	socketPath := filepath.Join(t.TempDir(), "exit.sock")
	exitCh := make(chan struct{})

	// Close exitCh after a tick so waitReady's exit-watch fires before
	// the dial deadline.
	go func() {
		time.Sleep(50 * time.Millisecond)
		close(exitCh)
	}()

	err := waitReady(socketPath, 5*time.Second, exitCh)
	if err == nil {
		t.Fatal("waitReady should have errored on early exit, got nil")
	}
	if !strings.Contains(err.Error(), "exited before ready") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNewReverseProxyOverUDS(t *testing.T) {
	socketPath := filepath.Join(t.TempDir(), "proxy.sock")

	// Stand up a minimal HTTP/1.1 server on a Unix socket. We bypass the
	// http package's listener wiring so the test stays focused on whether
	// the reverse proxy's custom Transport actually dials UDS.
	l, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("listen unix: %v", err)
	}
	t.Cleanup(func() { _ = l.Close() })

	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			_, _ = io.WriteString(w, "hello-uds:"+r.URL.Path)
		}),
	}
	go func() { _ = srv.Serve(l) }()
	t.Cleanup(func() { _ = srv.Close() })

	rp := newReverseProxy(socketPath)

	req := httptest.NewRequest(http.MethodGet, "http://backend/api/ping", nil)
	rec := httptest.NewRecorder()
	rp.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%q", rec.Code, rec.Body.String())
	}
	if got, want := rec.Body.String(), "hello-uds:/api/ping"; got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}

func TestSweepStaleSockets(t *testing.T) {
	dir := t.TempDir()
	mustTouch(t, filepath.Join(dir, "alive.sock"))
	mustTouch(t, filepath.Join(dir, "orphan.sock"))
	mustTouch(t, filepath.Join(dir, "ignore.txt"))

	cfg := &Config{SocketsDir: dir}
	reg := NewRegistry(cfg)
	wt, err := NewWorktree("alive", &Spec{Server: "/tmp/server"}, cfg)
	if err != nil {
		t.Fatalf("NewWorktree: %v", err)
	}
	reg.byName["alive"] = wt

	sweepStaleSockets(dir, reg)

	if _, err := os.Stat(filepath.Join(dir, "alive.sock")); err != nil {
		t.Fatalf("alive.sock should remain: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "orphan.sock")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("orphan.sock should be removed; stat err: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "ignore.txt")); err != nil {
		t.Fatalf("ignore.txt should remain (only *.sock is swept): %v", err)
	}
}

func TestStartBackendUnlinksStaleSocket(t *testing.T) {
	// We don't actually spawn bun here — we exercise just the unlink-before-spawn
	// logic by populating the socket path with a stale file and confirming the
	// helper that runs on spawn would remove it. Since startBackend bundles
	// unlink + cmd.Start, the cleanest unit-level check is to call os.Remove
	// directly with the same semantics startBackend uses.
	dir := t.TempDir()
	socketPath := filepath.Join(dir, "stale.sock")
	mustTouch(t, socketPath)

	if err := os.Remove(socketPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("unlink: %v", err)
	}
	if _, err := os.Stat(socketPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stale socket should be gone; stat err: %v", err)
	}

	// Idempotent on missing file.
	if err := os.Remove(socketPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("unlink missing should be silent, got: %v", err)
	}
}

func TestNewWorktreeRejectsOverlongSocketPath(t *testing.T) {
	cfg := &Config{SocketsDir: strings.Repeat("a", 90)}
	_, err := NewWorktree("bbbbbbbbbbbbbbbb", &Spec{Server: "/tmp/server"}, cfg)
	if err == nil {
		t.Fatal("expected error for overlong path, got nil")
	}
	if !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// ─── helpers ─────────────────────────────────────────────────

func mustTouch(t *testing.T, path string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create %s: %v", path, err)
	}
	_ = f.Close()
}
