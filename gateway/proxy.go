package main

import (
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
	reg *Registry
}

func NewProxy(reg *Registry) *Proxy {
	return &Proxy{reg: reg}
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	worktreeName := parseWorktree(r.Host)

	// /gateway/* is reserved on every host, including the no-subdomain root.
	if strings.HasPrefix(r.URL.Path, "/gateway/") {
		p.handleGatewayAPI(w, r)
		return
	}

	// No subdomain → no app to serve. Tell the user to use a named worktree.
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

// handleStatic serves a file from the worktree's web/dist directory. For paths
// without a known file (and no extension), it falls back to serving index.html
// so the SPA can handle client-side routing.
func (p *Proxy) handleStatic(w http.ResponseWriter, r *http.Request, wt *Worktree) {
	webDir := wt.Spec().Web
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
	// Missing or directory → SPA fallback for non-asset URLs.
	if path.Ext(upath) == "" || (err == nil && info.IsDir()) {
		indexPath := filepath.Join(webDir, "index.html")
		if _, ierr := os.Stat(indexPath); ierr == nil {
			http.ServeFile(w, r, indexPath)
			return
		}
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
// shuttles bytes both ways until either side closes.
func (p *Proxy) handleWebSocket(w http.ResponseWriter, r *http.Request, wt *Worktree) {
	if _, err := wt.Ensure(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	port := wt.Snapshot().Port
	if port == 0 {
		http.Error(w, "backend port unavailable", http.StatusBadGateway)
		return
	}
	backendAddr := fmt.Sprintf("127.0.0.1:%d", port)

	backendConn, err := net.DialTimeout("tcp", backendAddr, 3*time.Second)
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

	// Forward the original request line + headers to the backend.
	r.Host = backendAddr
	if err := r.Write(backendConn); err != nil {
		return
	}

	wt.IncConns()
	defer wt.DecConns()

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

	// POST /gateway/worktrees/<name>/restart — stop the running backend so the
	// next request spawns a fresh process with the latest code.
	const restartPrefix = "/gateway/worktrees/"
	if r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, restartPrefix) && strings.HasSuffix(r.URL.Path, "/restart") {
		name := strings.TrimPrefix(r.URL.Path, restartPrefix)
		name = strings.TrimSuffix(name, "/restart")
		if name == "" || strings.Contains(name, "/") {
			http.NotFound(w, r)
			return
		}
		wt := p.reg.Get(name)
		if wt == nil {
			http.Error(w, "unknown worktree: "+name, http.StatusNotFound)
			return
		}
		if err := wt.Stop(r.Context()); err != nil {
			http.Error(w, "stop failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"restarted":true}` + "\n"))
		return
	}

	http.NotFound(w, r)
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
