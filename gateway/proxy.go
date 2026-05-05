package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

// Proxy is the gateway's top-level http.Handler. It dispatches every request
// to one of: gateway API, static file, backend HTTP proxy, or backend WS proxy.
type Proxy struct {
	reg    *Registry
	routes *CentralRoutesStore
	pg     *PgSupervisor
}

func NewProxy(reg *Registry, routes *CentralRoutesStore, pg *PgSupervisor) *Proxy {
	return &Proxy{reg: reg, routes: routes, pg: pg}
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	worktreeName := parseWorktree(r.Host)

	// /gateway/* is reserved on every host, including the no-subdomain root.
	if strings.HasPrefix(r.URL.Path, "/gateway/") {
		p.handleGatewayAPI(w, r)
		return
	}

	// /api/database/status is owned by the gateway: PG is supervised here, not
	// in central. Intercept before the central-routes lookup so this answer is
	// authoritative even if a stale manifest still routes the path elsewhere.
	if r.URL.Path == "/api/database/status" && r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(p.pg.Status())
		return
	}

	// Central routing manifest: paths declared by central plugins are forwarded
	// to the singleton central backend regardless of which host the request
	// arrived on (including bare localhost). The manifest is written by
	// `./singularity build` to ~/.singularity/central-routes.json and watched
	// for changes — see central_routes.go. Auth's `/api/auth/{start,callback}/*`
	// callbacks (which Google requires on bare-localhost) reach central through
	// this same mechanism since auth migrated to the central runtime.
	if backend := p.routes.Get().Match(r.URL.Path); backend != "" {
		worktreeName = backend
	}

	if worktreeName == "" {
		http.Error(w, "Singularity gateway. Use <name>.localhost.", http.StatusNotFound)
		return
	}

	wt := p.reg.Get(worktreeName)
	if wt == nil {
		http.Error(w, "unknown worktree: "+worktreeName, http.StatusNotFound)
		return
	}

	if isBackendPath(r.URL.Path) {
		if isWebSocketUpgrade(r) {
			p.handleWebSocket(w, r, wt)
		} else {
			p.handleHTTP(w, r, wt)
		}
		return
	}

	p.handleStatic(w, r, wt)
}

// ─── route handlers ──────────────────────────────────────────

// handleStatic serves a file from the worktree's web/dist directory. Any path
// that doesn't match an existing file falls back to index.html so the SPA
// client router can handle it (including paths with extensions like /file/foo.ts).
func (p *Proxy) handleStatic(w http.ResponseWriter, r *http.Request, wt *Worktree) {
	webDir := wt.Spec().Web
	if webDir == "" {
		// Headless backend (e.g. central) — no static bundle to serve.
		http.NotFound(w, r)
		return
	}
	upath := path.Clean(r.URL.Path)
	if upath == "/" || upath == "." {
		upath = "/index.html"
	}
	full := filepath.Join(webDir, upath)

	info, err := os.Stat(full)
	if err == nil && !info.IsDir() {
		http.ServeFile(w, r, full)
		return
	}
	// File not found or is a directory → SPA fallback regardless of extension.
	// The client router decides whether it's a real route or a 404.
	indexPath := filepath.Join(webDir, "index.html")
	if _, ierr := os.Stat(indexPath); ierr == nil {
		http.ServeFile(w, r, indexPath)
		return
	}
	http.NotFound(w, r)
}

// handleHTTP cold-starts the backend if needed and proxies the request.
func (p *Proxy) handleHTTP(w http.ResponseWriter, r *http.Request, wt *Worktree) {
	rp, err := wt.Ensure(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	rp.ServeHTTP(w, r)
	wt.TouchBackend()
}

// handleWebSocket cold-starts the backend, hijacks the client connection, and
// shuttles bytes both ways until either side closes. The WebSocket connection
// is pinned to the backend that was active at dial time — a hot restart swaps
// new requests to the new backend without disturbing open connections.
func (p *Proxy) handleWebSocket(w http.ResponseWriter, r *http.Request, wt *Worktree) {
	if _, err := wt.Ensure(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	bk := wt.activeBackend()
	if bk == nil {
		http.Error(w, "backend socket unavailable", http.StatusBadGateway)
		return
	}

	dialCtx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var d net.Dialer
	backendConn, err := d.DialContext(dialCtx, "unix", bk.socketPath)
	if err != nil {
		http.Error(w, "backend dial: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer backendConn.Close()

	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijack unsupported", http.StatusInternalServerError)
		return
	}
	clientConn, _, err := hj.Hijack()
	if err != nil {
		return
	}
	defer clientConn.Close()

	// Forward the original request line + headers to the backend over UDS.
	// Bun doesn't validate Host against the listener type; leaving the
	// incoming Host intact is fine and matches what backends saw under TCP.
	if err := r.Write(backendConn); err != nil {
		return
	}

	wt.TouchBackend()
	bk.incConns()
	defer bk.decConns()

	errc := make(chan error, 2)
	go func() {
		_, e := io.Copy(backendConn, clientConn)
		errc <- e
	}()
	go func() {
		_, e := io.Copy(clientConn, backendConn)
		errc <- e
	}()
	<-errc
}

// handleGatewayAPI serves /gateway/* endpoints.
func (p *Proxy) handleGatewayAPI(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/gateway/worktrees" && r.Method == http.MethodGet {
		list := p.reg.List()
		out := make([]WorktreeStatus, 0, len(list))
		for _, wt := range list {
			out = append(out, wt.Snapshot())
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
		return
	}

	const prefix = "/gateway/worktrees/"
	if strings.HasPrefix(r.URL.Path, prefix) {
		rest := strings.TrimPrefix(r.URL.Path, prefix)
		slash := strings.Index(rest, "/")
		if slash <= 0 {
			http.NotFound(w, r)
			return
		}
		name := rest[:slash]
		action := rest[slash+1:]
		if name == "" || strings.Contains(name, "/") {
			http.NotFound(w, r)
			return
		}
		wt := p.reg.Get(name)
		if wt == nil {
			http.Error(w, "unknown worktree: "+name, http.StatusNotFound)
			return
		}

		switch {
		case action == "restart" && r.Method == http.MethodPost:
			ctx := r.Context()
			snap := wt.Snapshot()
			switch snap.State {
			case "running", "restarting":
				if err := wt.Restart(ctx); err != nil {
					http.Error(w, "hot restart failed: "+err.Error(), http.StatusInternalServerError)
					return
				}
			case "idle", "broken":
				if _, err := wt.Ensure(ctx); err != nil {
					http.Error(w, "cold start failed: "+err.Error(), http.StatusInternalServerError)
					return
				}
			default:
				http.Error(w, "backend is "+snap.State+"; retry shortly", http.StatusServiceUnavailable)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"restarted":true}` + "\n"))
			return

		case action == "logs" && r.Method == http.MethodGet:
			streamBackendLogs(w, r, wt)
			return
		}
	}

	http.NotFound(w, r)
}

// streamBackendLogs serves a Server-Sent Events stream of a worktree's
// backend stdout/stderr. On connect, one `event: history` message delivers
// the current ring buffer contents; each subsequent log line is sent as
// `event: entry`. The stream ends when the client disconnects.
func streamBackendLogs(w http.ResponseWriter, r *http.Request, wt *Worktree) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	snapshot, ch, unsub := wt.logBuf.Subscribe()
	defer unsub()

	historyPayload, err := json.Marshal(map[string]any{"entries": snapshot})
	if err != nil {
		return
	}
	if _, err := fmt.Fprintf(w, "event: history\ndata: %s\n\n", historyPayload); err != nil {
		return
	}
	flusher.Flush()

	pingTick := time.NewTicker(25 * time.Second)
	defer pingTick.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case e, ok := <-ch:
			if !ok {
				return
			}
			payload, err := json.Marshal(e)
			if err != nil {
				continue
			}
			if _, err := fmt.Fprintf(w, "event: entry\ndata: %s\n\n", payload); err != nil {
				return
			}
			flusher.Flush()
		case <-pingTick.C:
			if _, err := fmt.Fprintf(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// ─── pure helpers ────────────────────────────────────────────

// parseWorktree extracts the worktree name from a Host header.
// Returns "" for loopback hostnames or anything not matching <name>.localhost.
func parseWorktree(host string) string {
	h := host
	// IPv6 with brackets: [::1]:9000
	if strings.HasPrefix(h, "[") {
		if end := strings.Index(h, "]"); end >= 0 {
			h = h[1:end]
		}
	} else if i := strings.LastIndex(h, ":"); i > 0 {
		// Strip port for v4 / hostnames
		h = h[:i]
	}
	h = strings.ToLower(h)
	h = strings.TrimSuffix(h, ".")
	switch h {
	case "localhost", "127.0.0.1", "::1":
		return ""
	}
	if !strings.HasSuffix(h, ".localhost") {
		return ""
	}
	name := strings.TrimSuffix(h, ".localhost")
	if strings.Contains(name, ".") {
		return ""
	}
	return name
}

func isBackendPath(p string) bool {
	return strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/ws/")
}

func isWebSocketUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}
