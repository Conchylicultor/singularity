//go:build !darwin

package main

import "log/slog"

// logSigtermSender logs the shutdown. Only darwin can name the sender (and
// runs `ps` with the ChildEnv to do so); elsewhere the argument is unused.
func logSigtermSender(ChildEnv) {
	slog.Info("shutdown signal received")
}
