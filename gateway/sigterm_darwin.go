//go:build darwin

package main

/*
#include <signal.h>
#include <stdatomic.h>
#include <stdint.h>
#include <sys/types.h>

static _Atomic int32_t _sigterm_sender_pid = 0;
static struct sigaction _prev_sigterm_sa;

static void _sigterm_sa_handler(int sig, siginfo_t *info, void *ctx) {
	if (info != NULL)
		atomic_store(&_sigterm_sender_pid, (int32_t)info->si_pid);
	// Chain to Go runtime's handler so signal.NotifyContext still fires.
	if (_prev_sigterm_sa.sa_flags & SA_SIGINFO) {
		if (_prev_sigterm_sa.sa_sigaction != NULL)
			_prev_sigterm_sa.sa_sigaction(sig, info, ctx);
	} else if (_prev_sigterm_sa.sa_handler != SIG_DFL &&
	           _prev_sigterm_sa.sa_handler != SIG_IGN) {
		_prev_sigterm_sa.sa_handler(sig);
	}
}

static void installSigtermSAInfo(void) {
	struct sigaction sa = {0};
	sa.sa_sigaction = _sigterm_sa_handler;
	sigemptyset(&sa.sa_mask);
	sa.sa_flags = SA_SIGINFO;
	sigaction(SIGTERM, &sa, &_prev_sigterm_sa);
}

static int32_t sigtermSenderPid(void) {
	return atomic_load(&_sigterm_sender_pid);
}
*/
import "C"

import (
	"log/slog"
	"os/exec"
	"strconv"
	"strings"
)

func init() {
	C.installSigtermSAInfo()
}

func logSigtermSender() {
	pid := int(C.sigtermSenderPid())
	if pid == 0 {
		slog.Info("shutdown signal received")
		return
	}
	name := pidComm(pid)
	slog.Info("shutdown signal received", "sigterm_from_pid", pid, "sigterm_from_name", name)
}

func pidComm(pid int) string {
	out, err := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "comm=").Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(out))
}
