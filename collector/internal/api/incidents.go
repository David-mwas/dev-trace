package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/devtrace/collector/internal/models"
)

func (s *EventStore) HandleListIncidents(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(`SELECT id, project_id, title, severity, status, root_event_id, created_at, resolved_at FROM incidents ORDER BY created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var incidents []models.Incident
	for rows.Next() {
		var i models.Incident
		var severity, rootEventID sql.NullString
		var resolvedAt sql.NullInt64

		if err := rows.Scan(&i.ID, &i.ProjectID, &i.Title, &severity, &i.Status, &rootEventID, &i.CreatedAt, &resolvedAt); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if severity.Valid { i.Severity = severity.String }
		if rootEventID.Valid { i.RootEventID = rootEventID.String }
		if resolvedAt.Valid { i.ResolvedAt = resolvedAt.Int64 }

		incidents = append(incidents, i)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if incidents == nil {
		incidents = []models.Incident{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(incidents)
}

func (s *EventStore) HandleUpdateIncident(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "missing incident id", http.StatusBadRequest)
		return
	}

	var updateData struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&updateData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_, err := s.DB.Exec(`UPDATE incidents SET status = ? WHERE id = ?`, updateData.Status, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
