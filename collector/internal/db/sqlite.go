package db

import (
	"database/sql"
	_ "embed"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed schema.sql
var schemaSQL string

func InitDB(dbPath string) (*sql.DB, error) {
	if dbPath == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to get home dir: %w", err)
		}
		dbDir := filepath.Join(homeDir, ".devtrace")
		if err := os.MkdirAll(dbDir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create db directory: %w", err)
		}
		dbPath = filepath.Join(dbDir, "devtrace.db")
	} else {
		dbDir := filepath.Dir(dbPath)
		if err := os.MkdirAll(dbDir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create db directory: %w", err)
		}
	}

	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Execute schema creation
	if _, err := db.Exec(schemaSQL); err != nil {
		return nil, fmt.Errorf("failed to create schema: %w", err)
	}

	// Run incremental migrations (safe to run on existing DBs)
	migrations := []string{
		`ALTER TABLE events ADD COLUMN duration_ms INTEGER`,
		`ALTER TABLE events ADD COLUMN incident_id TEXT REFERENCES incidents(id)`,
		`ALTER TABLE events ADD COLUMN session_id TEXT`,
		`ALTER TABLE events ADD COLUMN breadcrumbs TEXT`,
	}
	for _, m := range migrations {
		// Ignore "duplicate column" errors from SQLite
		db.Exec(m) //nolint:errcheck
	}

	return db, nil
}
