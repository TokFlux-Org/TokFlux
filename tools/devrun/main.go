package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"syscall"
	"time"
)

const (
	pollInterval = time.Second
	buildTimeout = 5 * time.Minute
)

type fileState struct {
	modTime time.Time
	size    int64
}

type appProcess struct {
	cmd  string
	proc *exec.Cmd
	done chan error
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	if err := ensureDist(); err != nil {
		return err
	}
	if err := os.MkdirAll("tmp", 0o755); err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var app *appProcess
	defer func() {
		if app != nil {
			_ = app.stop()
			_ = os.Remove(app.cmd)
		}
	}()

	if next, err := rebuildAndStart(ctx, nil); err == nil {
		app = next
	} else {
		fmt.Fprintf(os.Stderr, "initial build failed: %v\n", err)
	}

	last, err := snapshot()
	if err != nil {
		return err
	}

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if app != nil {
				select {
				case err := <-app.done:
					if err != nil {
						fmt.Fprintf(os.Stderr, "backend exited: %v\n", err)
					} else {
						fmt.Fprintln(os.Stderr, "backend exited")
					}
					_ = os.Remove(app.cmd)
					app = nil
				default:
				}
			}

			current, err := snapshot()
			if err != nil {
				fmt.Fprintf(os.Stderr, "watch scan failed: %v\n", err)
				continue
			}
			changed := changedFiles(last, current)
			if len(changed) == 0 {
				continue
			}
			last = current

			fmt.Printf("changed: %s\n", strings.Join(changed, ", "))
			next, err := rebuildAndStart(ctx, app)
			if err != nil {
				fmt.Fprintf(os.Stderr, "build failed: %v\n", err)
				continue
			}
			app = next
		}
	}
}

func rebuildAndStart(ctx context.Context, current *appProcess) (*appProcess, error) {
	if err := ensureDist(); err != nil {
		return current, err
	}

	bin := filepath.Join("tmp", fmt.Sprintf("new-api-dev-%d%s", time.Now().UnixNano(), executableExt()))
	if err := build(ctx, bin); err != nil {
		_ = os.Remove(bin)
		return current, err
	}

	if current != nil {
		if err := current.stop(); err != nil {
			fmt.Fprintf(os.Stderr, "failed to stop previous process: %v\n", err)
		}
		_ = os.Remove(current.cmd)
	}

	next, err := start(ctx, bin)
	if err != nil {
		_ = os.Remove(bin)
		return nil, err
	}
	return next, nil
}

func build(parent context.Context, bin string) error {
	ctx, cancel := context.WithTimeout(parent, buildTimeout)
	defer cancel()

	fmt.Println("building backend...")
	cmd := exec.CommandContext(ctx, "go", "build", "-buildvcs=false", "-o", bin, ".")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return err
	}
	fmt.Println("build complete")
	return nil
}

func start(ctx context.Context, bin string) (*appProcess, error) {
	fmt.Println("starting backend...")
	cmd := exec.CommandContext(ctx, bin)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Env = os.Environ()
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()
	return &appProcess{cmd: bin, proc: cmd, done: done}, nil
}

func (p *appProcess) stop() error {
	if p == nil || p.proc == nil || p.proc.Process == nil {
		return nil
	}

	_ = p.proc.Process.Signal(os.Interrupt)
	done := make(chan error, 1)
	go func() {
		done <- <-p.done
	}()

	select {
	case <-time.After(3 * time.Second):
		return p.proc.Process.Kill()
	case err := <-done:
		if err != nil && !isExpectedExit(err) {
			return err
		}
		return nil
	}
}

func snapshot() (map[string]fileState, error) {
	files := make(map[string]fileState)
	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == "." {
			return nil
		}
		name := filepath.ToSlash(path)
		if entry.IsDir() {
			if shouldSkipDir(name) {
				return filepath.SkipDir
			}
			return nil
		}
		if !shouldWatchFile(name) {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		files[name] = fileState{modTime: info.ModTime(), size: info.Size()}
		return nil
	})
	return files, err
}

func changedFiles(previous, current map[string]fileState) []string {
	changed := make([]string, 0)
	for path, state := range current {
		old, ok := previous[path]
		if !ok || !old.modTime.Equal(state.modTime) || old.size != state.size {
			changed = append(changed, path)
		}
	}
	for path := range previous {
		if _, ok := current[path]; !ok {
			changed = append(changed, path)
		}
	}
	sort.Strings(changed)
	if len(changed) > 5 {
		return append(changed[:5], fmt.Sprintf("...%d more", len(changed)-5))
	}
	return changed
}

func ensureDist() error {
	paths := []string{
		filepath.Join("web", "default", "dist", "index.html"),
		filepath.Join("web", "classic", "dist", "index.html"),
	}
	for _, path := range paths {
		if err := ensureFile(path); err != nil {
			return fmt.Errorf("prepare %s: %w", path, err)
		}
	}
	return nil
}

func ensureFile(path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	const placeholder = "<!doctype html><html><head><title>dev</title></head><body>use frontend dev server</body></html>\n"
	return os.WriteFile(path, []byte(placeholder), 0o644)
}

func shouldSkipDir(path string) bool {
	switch path {
	case ".git",
		".gocache",
		".gomodcache",
		".idea",
		".vscode",
		"data",
		"electron/node_modules",
		"logs",
		"tmp",
		"upload",
		"web/classic/dist",
		"web/default/dist",
		"web/node_modules":
		return true
	default:
		return false
	}
}

func shouldWatchFile(path string) bool {
	switch filepath.Base(path) {
	case ".env", "go.mod", "go.sum":
		return true
	}

	switch strings.ToLower(filepath.Ext(path)) {
	case ".go", ".html", ".json", ".toml", ".yaml", ".yml":
		return true
	default:
		return false
	}
}

func executableExt() string {
	if runtime.GOOS == "windows" {
		return ".exe"
	}
	return ""
}

func isExpectedExit(err error) bool {
	var exitErr *exec.ExitError
	return errors.As(err, &exitErr)
}
