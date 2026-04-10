package main

import (
	"errors"
	"fmt"
	"net"
	"sync"
)

// ErrPoolExhausted is returned when no port in the configured range is available.
var ErrPoolExhausted = errors.New("port pool exhausted")

// PortPool hands out ports from a fixed range. Acquired ports are returned to
// the pool on Release. Acquire probes the port with net.Listen and skips any
// that are currently held by an unrelated process.
type PortPool struct {
	mu   sync.Mutex
	free []int
	all  map[int]bool
}

func NewPortPool(min, max int) *PortPool {
	if min <= 0 || max < min {
		panic(fmt.Sprintf("invalid port range: min=%d max=%d", min, max))
	}
	free := make([]int, 0, max-min+1)
	all := make(map[int]bool, max-min+1)
	for p := max; p >= min; p-- {
		free = append(free, p)
		all[p] = true
	}
	return &PortPool{free: free, all: all}
}

// Acquire pops a free port from the pool, probing each candidate with
// net.Listen so externally-occupied ports are skipped (and discarded for the
// remainder of the gateway's lifetime).
func (p *PortPool) Acquire() (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for len(p.free) > 0 {
		n := len(p.free) - 1
		port := p.free[n]
		p.free = p.free[:n]
		if portFree(port) {
			return port, nil
		}
	}
	return 0, ErrPoolExhausted
}

// Release returns a port to the pool. Releasing a port not owned by the pool
// is a programming error.
func (p *PortPool) Release(port int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.all[port] {
		panic(fmt.Sprintf("Release: port %d not in pool", port))
	}
	p.free = append(p.free, port)
}

func portFree(port int) bool {
	l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = l.Close()
	return true
}
