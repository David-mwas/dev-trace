curl -X POST http://localhost:4310/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"id": "proj-1", "name": "API Service", "path": "/api"}'

curl -X POST http://localhost:4310/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-1",
    "project_id": "proj-1",
    "timestamp": '$(date +%s%3N)',
    "type": "error",
    "severity": "critical",
    "service": "billing-api",
    "environment": "production",
    "payload": "Payment processing failed",
    "exceptions": [
      {
        "id": "exc-1",
        "type": "StripeError",
        "message": "Card declined: insufficient funds",
        "stack_trace": [
          {"filename": "billing.js", "function": "processPayment", "line": 42, "column": 12},
          {"filename": "app.js", "function": "handleCheckout", "line": 105, "column": 5}
        ]
      }
    ]
  }'

curl -X POST http://localhost:4310/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-2",
    "project_id": "proj-1",
    "timestamp": '$(date +%s%3N)',
    "type": "trace",
    "severity": "info",
    "service": "auth-service",
    "environment": "production",
    "payload": "User logged in successfully"
  }'
