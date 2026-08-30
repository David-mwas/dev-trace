package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/devtrace/collector/internal/api"
	"github.com/devtrace/collector/internal/db"
)

func main() {
	fmt.Println("DevTrace Collector starting...")

	// Initialize the database in the local directory for now, 
	// can be overridden by env var later.
	database, err := db.InitDB("./devtrace.db")
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer database.Close()

	// Setup HTTP server
	mux := api.NewServer(database)

	port := ":4310"
	fmt.Printf("Listening on %s\n", port)
	if err := http.ListenAndServe(port, mux); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
