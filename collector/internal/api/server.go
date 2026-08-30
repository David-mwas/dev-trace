package api

import (
	"database/sql"
	"net/http"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func NewServer(db *sql.DB) http.Handler {
	store := &EventStore{DB: db}
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/v1/events", store.HandleCreateEvent)
	mux.HandleFunc("GET /api/v1/events", store.HandleListEvents)
	mux.HandleFunc("DELETE /api/v1/events", store.HandleClearEvents)
	mux.HandleFunc("POST /api/v1/projects", store.HandleCreateProject)
	mux.HandleFunc("GET /api/v1/projects", store.HandleListProjects)
	mux.HandleFunc("DELETE /api/v1/projects/{id}", store.HandleDeleteProject)
	mux.HandleFunc("GET /api/v1/incidents", store.HandleListIncidents)
	mux.HandleFunc("PATCH /api/v1/incidents/{id}", store.HandleUpdateIncident)
	mux.HandleFunc("GET /api/v1/analytics", store.HandleAnalytics)

	return corsMiddleware(mux)
}
