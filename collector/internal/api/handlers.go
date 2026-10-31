package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/devtrace/collector/internal/models"
)

// ── Broadcaster for Real-time SSE ───────────────────────────────────────────

type Broadcaster struct {
	sync.RWMutex
	clients map[chan []byte]bool
}

func NewBroadcaster() *Broadcaster {
	return &Broadcaster{
		clients: make(map[chan []byte]bool),
	}
}

func (b *Broadcaster) Subscribe() chan []byte {
	b.Lock()
	defer b.Unlock()
	ch := make(chan []byte, 100)
	b.clients[ch] = true
	return ch
}

func (b *Broadcaster) Unsubscribe(ch chan []byte) {
	b.Lock()
	defer b.Unlock()
	if _, ok := b.clients[ch]; ok {
		delete(b.clients, ch)
		close(ch)
	}
}

func (b *Broadcaster) Broadcast(data []byte) {
	b.RLock()
	defer b.RUnlock()
	for ch := range b.clients {
		select {
		case ch <- data:
		default:
		}
	}
}

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

type EventStore struct {
	DB          *sql.DB
	Broadcaster *Broadcaster
}

func (s *EventStore) HandleAnalytics(w http.ResponseWriter, r *http.Request) {
	data := &AnalyticsData{
		Hourly:   []HourlyPoint{},
		Services: []ServiceCount{},
		Heatmap:  make([]HeatCell, 24),
		Trends:   map[string]*TrendStat{},
	}

	for i := 0; i < 24; i++ {
		data.Heatmap[i] = HeatCell{Hour: i}
	}

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

	var totalAll, totalCurr, totalPrev int
	s.DB.QueryRow(`SELECT COUNT(*) FROM events`).Scan(&totalAll) //nolint
	s.DB.QueryRow(`SELECT COUNT(*) FROM events WHERE timestamp >= ? AND timestamp < ?`, thisHourStart, nowMs).Scan(&totalCurr) //nolint
	s.DB.QueryRow(`SELECT COUNT(*) FROM events WHERE timestamp >= ? AND timestamp < ?`, prevHourStart, thisHourStart).Scan(&totalPrev) //nolint
	delta := 0.0
	if totalPrev > 0 { delta = float64(totalCurr-totalPrev) / float64(totalPrev) * 100 } else if totalCurr > 0 { delta = 100 }
	data.Trends["all"] = &TrendStat{Total: totalAll, Current: totalCurr, Previous: totalPrev, Delta: delta}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
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

	var breadcrumbsJSON sql.NullString
	if len(event.Breadcrumbs) > 0 {
		if b, err := json.Marshal(event.Breadcrumbs); err == nil {
			breadcrumbsJSON.String = string(b)
			breadcrumbsJSON.Valid = true
		}
	}

	var sessionID sql.NullString
	if event.SessionID != "" {
		sessionID.String = event.SessionID
		sessionID.Valid = true
	}

	query := `INSERT INTO events (
		id, project_id, timestamp, type, severity, service, environment, 
		trace_id, span_id, parent_span_id, duration_ms, payload, metadata, created_at, incident_id, session_id, breadcrumbs
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err = tx.Exec(query,
		event.ID, event.ProjectID, event.Timestamp, event.Type,
		event.Severity, event.Service, event.Environment,
		event.TraceID, event.SpanID, event.ParentSpanID, event.DurationMs,
		event.Payload, event.Metadata, event.CreatedAt, incidentID,
		sessionID, breadcrumbsJSON,
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

	// Broadcast to SSE clients for instant live feed
	if s.Broadcaster != nil {
		if eventBytes, err := json.Marshal(event); err == nil {
			s.Broadcaster.Broadcast(eventBytes)
		}
	}

	w.WriteHeader(http.StatusCreated)
}

func (s *EventStore) HandleEventStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if s.Broadcaster == nil {
		s.Broadcaster = NewBroadcaster()
	}

	ch := s.Broadcaster.Subscribe()
	defer s.Broadcaster.Unsubscribe(ch)

	// Initial heartbeat
	fmt.Fprintf(w, "event: ping\ndata: {}\n\n")
	flusher.Flush()

	ctx := r.Context()
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, "event: ping\ndata: {}\n\n")
			flusher.Flush()
		case data, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: event\ndata: %s\n\n", string(data))
			flusher.Flush()
		}
	}
}

func (s *EventStore) HandleListSessions(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT 
			session_id,
			COALESCE(project_id, '') as project_id,
			COALESCE(service, 'unknown') as service,
			COUNT(*) as event_count,
			SUM(CASE WHEN type = 'error' THEN 1 ELSE 0 END) as error_count,
			MIN(timestamp) as first_seen,
			MAX(timestamp) as last_seen,
			MAX(CASE WHEN (breadcrumbs IS NOT NULL AND breadcrumbs != '' AND breadcrumbs != '[]') OR type = 'error' THEN 1 ELSE 0 END) as has_replay
		FROM events
		WHERE session_id IS NOT NULL AND session_id != ''
		GROUP BY session_id
		ORDER BY last_seen DESC
		LIMIT 50
	`

	rows, err := s.DB.Query(query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var sessions []models.SessionSummary
	for rows.Next() {
		var sm models.SessionSummary
		var hasReplayInt int
		if err := rows.Scan(
			&sm.SessionID,
			&sm.ProjectID,
			&sm.Service,
			&sm.EventCount,
			&sm.ErrorCount,
			&sm.FirstSeen,
			&sm.LastSeen,
			&hasReplayInt,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		sm.HasReplay = hasReplayInt > 0
		sm.DurationMs = sm.LastSeen - sm.FirstSeen
		if sm.DurationMs < 0 {
			sm.DurationMs = 0
		}
		sessions = append(sessions, sm)
	}

	if sessions == nil {
		sessions = []models.SessionSummary{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
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
	sessionIDParam := r.URL.Query().Get("session_id")
	eventType := r.URL.Query().Get("type")

	query := `
		SELECT id, project_id, timestamp, type, severity, service, environment, 
			trace_id, span_id, parent_span_id, duration_ms, payload, metadata, created_at, incident_id,
			session_id, breadcrumbs
		FROM events`

	whereClauses := []string{}
	args := []any{}

	if projectID != "" {
		whereClauses = append(whereClauses, "project_id = ?")
		args = append(args, projectID)
	}
	if sessionIDParam != "" {
		whereClauses = append(whereClauses, "session_id = ?")
		args = append(args, sessionIDParam)
	}
	if eventType != "" {
		whereClauses = append(whereClauses, "type = ?")
		args = append(args, eventType)
	}

	if len(whereClauses) > 0 {
		query += " WHERE " + whereClauses[0]
		for i := 1; i < len(whereClauses); i++ {
			query += " AND " + whereClauses[i]
		}
	}

	// For session replay, chronological order (ASC) is best; otherwise latest first (DESC)
	if sessionIDParam != "" {
		query += ` ORDER BY timestamp ASC LIMIT 200`
	} else {
		query += ` ORDER BY timestamp DESC LIMIT 100`
	}

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
		var severity, service, environment, traceID, spanID, parentSpanID, incidentID, sessionID, breadcrumbs sql.NullString
		var durationMs sql.NullInt64

		if err := rows.Scan(
			&e.ID, &e.ProjectID, &e.Timestamp, &e.Type,
			&severity, &service, &environment,
			&traceID, &spanID, &parentSpanID, &durationMs,
			&payload, &metadata, &e.CreatedAt, &incidentID,
			&sessionID, &breadcrumbs,
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
		if durationMs.Valid { e.DurationMs = durationMs.Int64 }
		if payload.Valid { e.Payload = payload.String }
		if metadata.Valid { e.Metadata = metadata.String }
		if incidentID.Valid { e.IncidentID = incidentID.String }
		if sessionID.Valid { e.SessionID = sessionID.String }

		if breadcrumbs.Valid && breadcrumbs.String != "" {
			var bcList []models.Breadcrumb
			if err := json.Unmarshal([]byte(breadcrumbs.String), &bcList); err == nil {
				e.Breadcrumbs = bcList
			}
		}

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
		excRows.Close()
		events[i].Exceptions = exceptions
	}

	if events == nil {
		events = []models.Event{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}
