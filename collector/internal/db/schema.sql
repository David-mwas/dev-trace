CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT,
    status TEXT NOT NULL,
    root_event_id TEXT,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL,
    severity TEXT,
    service TEXT,
    environment TEXT,
    trace_id TEXT,
    span_id TEXT,
    parent_span_id TEXT,
    duration_ms INTEGER,
    payload TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    incident_id TEXT,
    session_id TEXT,
    breadcrumbs TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(incident_id) REFERENCES incidents(id)
);

CREATE TABLE IF NOT EXISTS exceptions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    stack_trace TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES events(id)
);
