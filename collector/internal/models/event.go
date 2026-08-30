package models

type Event struct {
	ID           string      `json:"id"`
	ProjectID    string      `json:"project_id"`
	Timestamp    int64       `json:"timestamp"`
	Type         string      `json:"type"`
	Severity     string      `json:"severity,omitempty"`
	Service      string      `json:"service,omitempty"`
	Environment  string      `json:"environment,omitempty"`
	TraceID      string      `json:"trace_id,omitempty"`
	SpanID       string      `json:"span_id,omitempty"`
	ParentSpanID string      `json:"parent_span_id,omitempty"`
	DurationMs   int64       `json:"duration_ms,omitempty"`
	Payload      string      `json:"payload,omitempty"`
	Metadata     string      `json:"metadata,omitempty"`
	CreatedAt    int64       `json:"created_at"`
	IncidentID   string      `json:"incident_id,omitempty"`
	Exceptions   []Exception `json:"exceptions,omitempty"`
}

type Project struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"created_at"`
}

type Incident struct {
	ID          string `json:"id"`
	ProjectID   string `json:"project_id"`
	Title       string `json:"title"`
	Severity    string `json:"severity,omitempty"`
	Status      string `json:"status"` // OPEN, INVESTIGATING, RESOLVED
	RootEventID string `json:"root_event_id,omitempty"`
	CreatedAt   int64  `json:"created_at"`
	ResolvedAt  int64  `json:"resolved_at,omitempty"`
}

type Exception struct {
	ID         string       `json:"id"`
	EventID    string       `json:"event_id"`
	Type       string       `json:"type"`
	Message    string       `json:"message"`
	StackTrace []StackFrame `json:"stack_trace"`
}

type StackFrame struct {
	Filename string `json:"filename"`
	Function string `json:"function"`
	Line     int    `json:"line"`
	Column   int    `json:"column"`
}
