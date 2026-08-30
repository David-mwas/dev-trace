import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DevTraceOptions, Event, Exception, LogOptions } from './types';
import { parseStackTrace } from './utils/stacktrace';

export interface TraceContext {
    traceId: string;
    spanId: string;
}

export class DevTrace {
    private options: Required<DevTraceOptions>;
    private endpoint: string;
    private als: AsyncLocalStorage<TraceContext>;

    constructor(options: DevTraceOptions) {
        if (!options.projectId) {
            throw new Error('DevTrace: projectId is required');
        }

        this.options = {
            projectId: options.projectId,
            collectorUrl: options.collectorUrl || 'http://localhost:4310',
            service: options.service || 'unknown-service',
            environment: options.environment || process.env.NODE_ENV || 'development'
        };

        // Normalize URL
        this.endpoint = this.options.collectorUrl.endsWith('/') 
            ? `${this.options.collectorUrl}api/v1/events` 
            : `${this.options.collectorUrl}/api/v1/events`;

        this.als = new AsyncLocalStorage<TraceContext>();
    }

    /**
     * Log a generic message event.
     */
    public async log(message: string, options: LogOptions = {}): Promise<void> {
        const ctx = this.als.getStore();
        
        const event: Event = {
            id: uuidv4(),
            project_id: this.options.projectId,
            timestamp: options.timestamp || Date.now(),
            type: 'log',
            severity: options.severity || 'info',
            service: this.options.service,
            environment: this.options.environment,
            payload: message,
            metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
            trace_id: options.traceId || ctx?.traceId,
            span_id: options.spanId,
            parent_span_id: options.parentSpanId || ctx?.spanId,
            duration_ms: options.durationMs
        };

        await this.sendEvent(event);
    }

    /**
     * Capture an error and its stack trace.
     */
    public async captureError(error: Error | unknown, options: LogOptions = {}): Promise<void> {
        const errorEventId = uuidv4();
        
        let message = 'Unknown Error';
        let errorType = 'Error';
        let exceptions: Exception[] = [];

        if (error instanceof Error) {
            message = error.message;
            errorType = error.name;
            exceptions = [{
                id: uuidv4(),
                type: errorType,
                message: message,
                stack_trace: parseStackTrace(error)
            }];
        } else if (typeof error === 'string') {
            message = error;
        } else {
            try {
                message = JSON.stringify(error);
            } catch (e) {
                // Ignore serialization errors
            }
        }

        const ctx = this.als.getStore();
        
        const event: Event = {
            id: errorEventId,
            project_id: this.options.projectId,
            timestamp: options.timestamp || Date.now(),
            type: 'error',
            severity: options.severity || 'error',
            service: this.options.service,
            environment: this.options.environment,
            payload: message,
            metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
            trace_id: options.traceId || ctx?.traceId,
            span_id: options.spanId,
            parent_span_id: options.parentSpanId || ctx?.spanId,
            duration_ms: options.durationMs,
            exceptions: exceptions.length > 0 ? exceptions : undefined
        };

        await this.sendEvent(event);
    }

    /**
     * Capture a trace span (e.g. an HTTP request or a background job).
     */
    public async trace(name: string, options: LogOptions = {}): Promise<void> {
        const ctx = this.als.getStore();
        
        const event: Event = {
            id: uuidv4(),
            project_id: this.options.projectId,
            timestamp: options.timestamp || Date.now(),
            type: 'trace',
            severity: options.severity || 'info',
            service: this.options.service,
            environment: this.options.environment,
            payload: name,
            metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
            trace_id: options.traceId || ctx?.traceId,
            span_id: options.spanId,
            parent_span_id: options.parentSpanId || ctx?.spanId,
            duration_ms: options.durationMs
        };

        await this.sendEvent(event);
    }

    private async sendEvent(event: Event): Promise<void> {
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event)
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`DevTrace: Failed to send event. Status: ${response.status}, Body: ${text}`);
            }
        } catch (error) {
            console.error(`DevTrace: Error sending event to collector`, error);
        }
    }

    /**
     * Run a block of code inside a specific trace context.
     * All logs/errors/traces within this block will automatically be linked to this traceId and spanId.
     */
    public runWithTrace<T>(traceId: string, spanId: string, fn: () => T): T {
        return this.als.run({ traceId, spanId }, fn);
    }

    /**
     * Wrap an asynchronous operation in a new child span.
     * Automatically calculates duration and emits a trace event when finished.
     */
    public async withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const parentCtx = this.als.getStore();
        if (!parentCtx) {
            // If there's no trace running, just execute the function normally
            return fn();
        }

        const traceId = parentCtx.traceId;
        const parentSpanId = parentCtx.spanId;
        const spanId = uuidv4();
        const startTime = Date.now();

        return this.als.run({ traceId, spanId }, async () => {
            try {
                const result = await fn();
                const durationMs = Date.now() - startTime;
                
                // Emit trace for successful completion
                this.trace(name, {
                    traceId,
                    spanId,
                    parentSpanId,
                    timestamp: startTime,
                    durationMs
                });
                
                return result;
            } catch (error) {
                const durationMs = Date.now() - startTime;
                
                // Automatically capture the error
                this.captureError(error, {
                    traceId,
                    spanId,
                    parentSpanId,
                    timestamp: startTime,
                    durationMs
                });
                
                // Still emit the trace span but mark as error
                this.trace(name, {
                    traceId,
                    spanId,
                    parentSpanId,
                    timestamp: startTime,
                    durationMs,
                    severity: 'error'
                });
                
                throw error;
            }
        });
    }
}
