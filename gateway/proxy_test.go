package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

// newTestProxy builds a Proxy with an empty registry and no central routes — so
// any resolved namespace falls through to a `reg.Get(name) == nil` "unknown
// worktree: <name>" 404. That message reveals WHICH namespace the router
// resolved, which is exactly what these routing tests assert on.
func newTestProxy(t *testing.T, defaultNamespace string) *Proxy {
	t.Helper()
	cfg := &Config{SocketsDir: t.TempDir()}
	reg := NewRegistry(cfg)
	routes := NewCentralRoutesStore(filepath.Join(t.TempDir(), "central-routes.json")) // unloaded ⇒ Match==""
	return NewProxy(reg, routes, &Supervisor{}, defaultNamespace)
}

func serve(p *Proxy, host, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "http://"+host+path, nil)
	req.Host = host
	rec := httptest.NewRecorder()
	p.ServeHTTP(rec, req)
	return rec
}

// Without a default namespace, a subdomain-less request still gets the generic
// gateway 404 — today's behavior, unchanged for dev/multi-app.
func TestNoDefaultNamespaceBareLocalhost404(t *testing.T) {
	rec := serve(newTestProxy(t, ""), "localhost:9000", "/")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Use <name>.localhost") {
		t.Fatalf("expected generic gateway 404, got %q", rec.Body.String())
	}
}

// With a default namespace, a subdomain-less request resolves to it and proceeds
// to registry lookup (here: not found ⇒ "unknown worktree: sonata"). The generic
// gateway 404 is NOT returned — proving the fallback engaged.
func TestDefaultNamespaceRoutesBareLocalhost(t *testing.T) {
	rec := serve(newTestProxy(t, "sonata"), "localhost:9000", "/")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "unknown worktree: sonata") {
		t.Fatalf("expected fallback to namespace 'sonata', got %q", body)
	}
	if strings.Contains(body, "Use <name>.localhost") {
		t.Fatalf("default namespace should bypass the generic gateway 404, got %q", body)
	}
}

// An explicit subdomain wins over the default namespace (lowest precedence).
func TestSubdomainBeatsDefaultNamespace(t *testing.T) {
	rec := serve(newTestProxy(t, "sonata"), "other.localhost:9000", "/")
	if !strings.Contains(rec.Body.String(), "unknown worktree: other") {
		t.Fatalf("subdomain should win over default, got %q", rec.Body.String())
	}
}

// /gateway/* stays reserved on the subdomain-less host even with a default set.
func TestGatewayAPIReservedUnderDefaultNamespace(t *testing.T) {
	rec := serve(newTestProxy(t, "sonata"), "localhost:9000", "/gateway/worktrees")
	// handleGatewayAPI answers (200 with a JSON list) — it must NOT fall through
	// to the default-namespace backend path.
	if rec.Code != http.StatusOK {
		t.Fatalf("/gateway/worktrees status = %d, want 200 (reserved path)", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "unknown worktree") {
		t.Fatalf("/gateway/* must not route to the default namespace, got %q", rec.Body.String())
	}
}
