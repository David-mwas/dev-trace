package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/devtrace/collector/internal/models"
)

// ── Analytics types ───────────────────────────────────────────────────────────

type HourlyPoint struct {
	Hour   string `json:"hour"`
	Errors int    `json:"errors"`
	Logs   int    `json:"logs"`
	Traces int    `json:"traces"`
}

type ServiceCount struct {
	Service string `json:"service"`
	Count   int    `json:"count"`
}

type HeatCell struct {
	Hour  int `json:"hour"`
	Count int `json:"count"`
}

type TrendStat struct {
	Total    int     `json:"total"`
	Current  int     `json:"current"`  // This hour
	Previous int     `json:"previous"` // Previous hour
	Delta    float64 `json:"delta"`    // % change
}

type AnalyticsData struct {
	Hourly   []HourlyPoint          `json:"hourly"`
	Services []ServiceCount         `json:"services"`
	Heatmap  []HeatCell             `json:"heatmap"`
	Trends   map[string]*TrendStat  `json:"trends"`
}

func (s *EventStore) HandleAnalytics(w http.ResponseWriter, r *http.Request) {
	data := &AnalyticsData{
		Hourly:   []HourlyPoint{},
		Services: []ServiceCount{},
		Heatmap:  make([]HeatCell, 24),
		Trends:   map[string]*TrendStat{},
	}

	// Init heatmap hours
	for i := 0; i < 24; i++ {
		data.Heatmap[i] = HeatCell{Hour: i}
	}

	// ── Hourly breakdown (last 24 hours) ──────────────────────────────────────
	since := time.Now().Add(-24 * time.Hour).UnixMilli()
	rows, err := s.DB.Query(`
		SELECT 
			strftime('%H', datetime(timestamp/1000, 'unixepoch')) as hr,
			type,
			COUNT(*) as cnt
		FROM events
		WHERE timestamp >= ?
		GROUP BY hr, type
		ORDER BY hr ASC
	`, since)
	if err == nil {
		defer rows.Close()
		hourMap := make(map[string]*HourlyPoint)
		for rows.Next() {
			var hr, typ string
			var cnt int
			if err := rows.Scan(&hr, &typ, &cnt); err != nil { continue }
			if _, ok := hourMap[hr]; !ok {
				hourMap[hr] = &HourlyPoint{Hour: hr + ":00"}
			}
			switch typ {
			case "error": hourMap[hr].Errors += cnt
			case "log":   hourMap[hr].Logs += cnt
			case "trace": hourMap[hr].Traces += cnt
			}
		}
		for _, pt := range hourMap {
			data.Hourly = append(data.Hourly, *pt)
		}
	}

	// ── Events by service ─────────────────────────────────────────────────────
	svcRows, err := s.DB.Query(`
		SELECT COALESCE(service, 'unknown'), COUNT(*) as cnt
		FROM events
		WHERE service IS NOT NULL AND service != ''
		GROUP BY service
		ORDER BY cnt DESC
		LIMIT 10
	`)
	if err == nil {
		defer svcRows.Close()
		for svcRows.Next() {
			var sc ServiceCount
			if err := svcRows.Scan(&sc.Service, &sc.Count); err == nil {
				data.Services = append(data.Services, sc)
			}
		}
	}

	// ── Heatmap (all time, by hour of day) ───────────────────────────────────
	hmRows, err := s.DB.Query(`
		SELECT 
			CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) as hr,
			COUNT(*) as cnt
		FROM events
		GROUP BY hr
	`)
	if err == nil {
		defer hmRows.Close()
		for hmRows.Next() {
			var hr, cnt int
			if err := hmRows.Scan(&hr, &cnt); err == nil && hr >= 0 && hr < 24 {
				data.Heatmap[hr].Count = cnt
			}
		}
	}

	// ── Trend stats ───────────────────────────────────────────────────────────
	nowMs := time.Now().UnixMilli()
	thisHourStart := time.Now().Truncate(time.Hour).UnixMilli()
	prevHourStart := thisHourStart - int64(time.Hour.Milliseconds())

	trendTypes := []string{"error", "log", "trace"}
	for _, typ := range trendTypes {
		var total, curr, prev int
		s.DB.QueryRow(`SELECT COUNT(*) FROM events WHERE type = ?`, typ).Scan(&total) //nolint
		s.DB.QueryRow(`SELECT COUNT(*) FROM events WHERE type = ? AND timestamp >= ? AND timestamp < ?`, typ, thisHourStart, nowMs).Scan(&curr) //nolint
		s.DB.QueryRow(`SELECT COUNT(*) FROM events WHERE type = ? AND timestamp >= ? AND timestamp < ?`, typ, prevHourStart, thisHourStart).Scan(&prev) //nolint

		delta := 0.0
		if prev > 0 {
			delta = float64(curr-prev) / float64(prev) * 100
		} else if curr > 0 {
			delta = 100
		}
		data.Trends[typ] = &TrendStat{Total: total, Current: curr, Previous: prev, Delta: delta}
	}

	// Total events trend
	var totalAll, totalCurr, totalPrev int
	s.DB.QueryRow(`SELECT COUNT(*) FROM events`).Scan(&totalAll) //nolint
	s.DB.QueryRow(`SELECT COUNT(*) FROM events WHERE timestamp >= ? AND timestamp < ?`, thisHourStart, nowMs).Scan(&totalCurr) //nolint
	s.DB.QueryRow(`SELECT COUNT(*) FROM events WHERE timestamp >= ? AND timestamp < ?`, prevHourStart, thisHourStart).Scan(&totalPrev) //nolint
	delta := 0.0
	if totalPrev > 0 { delta = float64(totalCurr-totalPrev) / float64(totalPrev) * 100 } else if totalCurr > 0 { delta = 100 }
	data.Trends["all"] = &TrendStat{Total: totalAll, Current: totalCurr, Previous: totalPrev, Delta: delta}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)

	_ = log.Writer() // suppress unused import warning
}


type EventStore struct {
	DB *sql.DB
}

func (s *EventStore) HandleCreateEvent(w http.ResponseWriter, r *http.Request) {
	var event models.Event
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if event.ID == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	if event.ProjectID == "" {
		http.Error(w, "missing project_id", http.StatusBadRequest)
		return
	}

	if event.CreatedAt == 0 {
		event.CreatedAt = time.Now().UnixMilli()
	}

	tx, err := s.DB.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// --- Incident Grouping Logic ---
	var incidentID sql.NullString
	if event.Type == "error" && len(event.Exceptions) > 0 {
		exc := event.Exceptions[0]
		title := fmt.Sprintf("%s: %s", exc.Type, exc.Message)
		if len(title) > 200 {
			title = title[:200]
		}

		var existingID string
		err := tx.QueryRow(`SELECT id FROM incidents WHERE project_id = ? AND title = ? AND status != 'RESOLVED' LIMIT 1`, event.ProjectID, title).Scan(&existingID)
		if err == sql.ErrNoRows {
			b := make([]byte, 16)
			rand.Read(b)
			existingID = "inc_" + hex.EncodeToString(b)
			
			_, err = tx.Exec(`INSERT INTO incidents (id, project_id, title, severity, status, root_event_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				existingID, event.ProjectID, title, event.Severity, "OPEN", event.ID, event.CreatedAt)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		incidentID.String = existingID
		incidentID.Valid = true
		event.IncidentID = existingID
	}
	// -------------------------------

	query := `INSERT INTO events (
		id, project_id, timestamp, type, severity, service, environment, 
		trace_id, span_id, parent_span_id, payload, metadata, created_at, incident_id
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err = tx.Exec(query,
		event.ID, event.ProjectID, event.Timestamp, event.Type,
		event.Severity, event.Service, event.Environment,
		event.TraceID, event.SpanID, event.ParentSpanID,
		event.Payload, event.Metadata, event.CreatedAt, incidentID,
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for _, exc := range event.Exceptions {
		excQuery := `INSERT INTO exceptions (id, event_id, type, message, stack_trace) VALUES (?, ?, ?, ?, ?)`
		stackTraceJSON, _ := json.Marshal(exc.StackTrace)
		_, err = tx.Exec(excQuery, exc.ID, event.ID, exc.Type, exc.Message, string(stackTraceJSON))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (s *EventStore) HandleCreateProject(w http.ResponseWriter, r *http.Request) {
	var project models.Project
	if err := json.NewDecoder(r.Body).Decode(&project); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if project.CreatedAt == 0 {
		project.CreatedAt = time.Now().UnixMilli()
	}

	query := `INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`
	_, err := s.DB.Exec(query, project.ID, project.Name, project.Path, project.CreatedAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(project)
}

func (s *EventStore) HandleListProjects(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(`SELECT id, name, path, created_at FROM projects ORDER BY created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var projects []models.Project
	for rows.Next() {
		var p models.Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Path, &p.CreatedAt); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		projects = append(projects, p)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Return empty array instead of null
	if projects == nil {
		projects = []models.Project{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projects)
}

func (s *EventStore) HandleDeleteProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "missing project id", http.StatusBadRequest)
		return
	}

	_, err := s.DB.Exec(`DELETE FROM projects WHERE id = ?`, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *EventStore) HandleClearEvents(w http.ResponseWriter, r *http.Request) {
	tx, err := s.DB.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM exceptions`); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(`DELETE FROM events`); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}


func (s *EventStore) HandleListEvents(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")

	query := `
		SELECT id, project_id, timestamp, type, severity, service, environment, 
			trace_id, span_id, parent_span_id, payload, metadata, created_at, incident_id
		FROM events`

	args := []any{}
	if projectID != "" {
		query += ` WHERE project_id = ?`
		args = append(args, projectID)
	}
	query += ` ORDER BY timestamp DESC LIMIT 100`

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var events []models.Event
	for rows.Next() {
		var e models.Event
		var payload, metadata sql.NullString
		var severity, service, environment, traceID, spanID, parentSpanID, incidentID sql.NullString

		if err := rows.Scan(
			&e.ID, &e.ProjectID, &e.Timestamp, &e.Type,
			&severity, &service, &environment,
			&traceID, &spanID, &parentSpanID,
			&payload, &metadata, &e.CreatedAt, &incidentID,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if severity.Valid { e.Severity = severity.String }
		if service.Valid { e.Service = service.String }
		if environment.Valid { e.Environment = environment.String }
		if traceID.Valid { e.TraceID = traceID.String }
		if spanID.Valid { e.SpanID = spanID.String }
		if parentSpanID.Valid { e.ParentSpanID = parentSpanID.String }
		if payload.Valid { e.Payload = payload.String }
		if metadata.Valid { e.Metadata = metadata.String }
		if incidentID.Valid { e.IncidentID = incidentID.String }

		events = append(events, e)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Fetch exceptions for these events
	for i := range events {
		excRows, err := s.DB.Query(`
			SELECT id, type, message, stack_trace
			FROM exceptions
			WHERE event_id = ?
		`, events[i].ID)
		if err != nil {
			continue
		}

		var exceptions []models.Exception
		for excRows.Next() {
			var exc models.Exception
			var stackTraceStr string
			if err := excRows.Scan(&exc.ID, &exc.Type, &exc.Message, &stackTraceStr); err == nil {
				exc.EventID = events[i].ID
				json.Unmarshal([]byte(stackTraceStr), &exc.StackTrace)
				exceptions = append(exceptions, exc)
			}
		}

		if err := excRows.Err(); err != nil {
			log.Printf("Error iterating exceptions for event %s: %v", events[i].ID, err)
		}

		excRows.Close()
		events[i].Exceptions = exceptions
	}

	if events == nil {
		events = []models.Event{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}
