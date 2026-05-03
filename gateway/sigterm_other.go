//go:build !darwin

package main

import "log/slog"

func logSigtermSender() {
	slog.Info("shutdown signal received")
}
