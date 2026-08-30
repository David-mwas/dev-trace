package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/devtrace/collector/internal/db"
	"github.com/devtrace/collector/internal/models"
)

func TestHandleCreateEvent(t *testing.T) {
	// Initialize in-memory database for testing
	database, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatalf("failed to initialize db: %v", err)
	}
	defer database.Close()

	store := &EventStore{DB: database}

	// Create a test project first
	_, err = database.Exec("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)",
		"proj-123", "Test Project", "/tmp/test", time.Now().UnixMilli())
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	event := models.Event{
		ID:        "evt-123",
		ProjectID: "proj-123",
		Timestamp: time.Now().UnixMilli(),
		Type:      "REQUEST",
		Service:   "test-service",
	}
	body, _ := json.Marshal(event)

	req, err := http.NewRequest("POST", "/api/v1/events", bytes.NewBuffer(body))
	if err != nil {
		t.Fatalf("could not create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(store.HandleCreateEvent)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusCreated {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusCreated)
	}

	// Verify it was saved
	var count int
	err = database.QueryRow("SELECT COUNT(*) FROM events WHERE id = ?", "evt-123").Scan(&count)
	if err != nil || count != 1 {
		t.Errorf("expected 1 event in database, got %v (err: %v)", count, err)
	}
}
