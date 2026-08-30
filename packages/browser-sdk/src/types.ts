export interface StackFrame {
    filename: string;
    function: string;
    line: number;
    column: number;
}

export interface Exception {
    id: string;
    type: string;
    message: string;
    stack_trace: StackFrame[];
}

export interface Event {
    id: string;
    project_id: string;
    timestamp: number; // UnixMilli
    type: string;
    severity?: string;
    service?: string;
    environment?: string;
    trace_id?: string;
    span_id?: string;
    parent_span_id?: string;
    payload?: string;
    metadata?: string;
    exceptions?: Exception[];
}

export interface DevTraceBrowserOptions {
    /** The project ID from the DevTrace dashboard */
    projectId: string;
    /** The URL of the DevTrace collector. Defaults to http://localhost:4310 */
    collectorUrl?: string;
    /** The name of the service running the SDK */
    service?: string;
    /** The environment (e.g. 'production', 'development') */
    environment?: string;
    /** Whether to wrap console.error. Defaults to false. */
    captureConsoleErrors?: boolean;
}

export interface LogOptions {
    severity?: 'debug' | 'info' | 'warning' | 'error';
    metadata?: Record<string, any>;
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
}
