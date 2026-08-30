import { v4 as uuidv4 } from 'uuid';
import ErrorStackParser from 'error-stack-parser';
import { DevTraceBrowserOptions, Event, Exception, LogOptions, StackFrame } from './types';

export class DevTraceBrowser {
    private options: Required<DevTraceBrowserOptions>;
    private endpoint: string;
    private originalConsoleError: typeof console.error | null = null;
    private initialized = false;

    constructor(options: DevTraceBrowserOptions) {
        if (!options.projectId) {
            throw new Error('DevTrace: projectId is required');
        }

        this.options = {
            projectId: options.projectId,
            collectorUrl: options.collectorUrl || 'http://localhost:4310',
            service: options.service || 'unknown-browser-app',
            environment: options.environment || 'development',
            captureConsoleErrors: options.captureConsoleErrors || false
        };

        this.endpoint = this.options.collectorUrl.endsWith('/') 
            ? `${this.options.collectorUrl}api/v1/events` 
            : `${this.options.collectorUrl}/api/v1/events`;
    }

    /**
     * Initialize global error handlers.
     */
    public init() {
        if (this.initialized) return;
        this.initialized = true;

        window.addEventListener('error', this.handleWindowError.bind(this));
        window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));

        if (this.options.captureConsoleErrors) {
            this.originalConsoleError = console.error;
            console.error = (...args: any[]) => {
                this.captureConsoleError(args);
                if (this.originalConsoleError) {
                    this.originalConsoleError.apply(console, args);
                }
            };
        }
    }

    private handleWindowError(event: ErrorEvent) {
        if (event.error) {
            this.captureError(event.error, { metadata: { source: 'window.onerror' } });
        } else {
            this.log(event.message || 'Unknown window error', { severity: 'error', metadata: { source: 'window.onerror' } });
        }
    }

    private handleUnhandledRejection(event: PromiseRejectionEvent) {
        if (event.reason instanceof Error) {
            this.captureError(event.reason, { metadata: { source: 'unhandledrejection' } });
        } else {
            this.log(String(event.reason), { severity: 'error', metadata: { source: 'unhandledrejection' } });
        }
    }

    private captureConsoleError(args: any[]) {
        const errorArg = args.find(a => a instanceof Error);
        if (errorArg) {
            this.captureError(errorArg, { metadata: { source: 'console.error', args: args.filter(a => a !== errorArg).map(String) } });
        } else {
            const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            this.log(message, { severity: 'error', metadata: { source: 'console.error' } });
        }
    }

    /**
     * Log a generic message event.
     */
    public async log(message: string, options: LogOptions = {}): Promise<void> {
        const event: Event = {
            id: uuidv4(),
            project_id: this.options.projectId,
            timestamp: Date.now(),
            type: 'log',
            severity: options.severity || 'info',
            service: this.options.service,
            environment: this.options.environment,
            payload: message,
            metadata: options.metadata ? JSON.stringify({ ...options.metadata, url: window.location.href, userAgent: navigator.userAgent }) : JSON.stringify({ url: window.location.href, userAgent: navigator.userAgent }),
            trace_id: options.traceId,
            span_id: options.spanId,
            parent_span_id: options.parentSpanId
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
            let frames: StackFrame[] = [];
            try {
                frames = ErrorStackParser.parse(error).map(frame => ({
                    filename: frame.fileName || '<unknown>',
                    function: frame.functionName || '<anonymous>',
                    line: frame.lineNumber || 0,
                    column: frame.columnNumber || 0
                }));
            } catch (e) {
                // Ignore parse errors
            }

            exceptions = [{
                id: uuidv4(),
                type: errorType,
                message: message,
                stack_trace: frames
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

        const metadataObj = options.metadata || {};
        metadataObj.url = window.location.href;
        metadataObj.userAgent = navigator.userAgent;

        const event: Event = {
            id: errorEventId,
            project_id: this.options.projectId,
            timestamp: Date.now(),
            type: 'error',
            severity: options.severity || 'error',
            service: this.options.service,
            environment: this.options.environment,
            payload: message,
            metadata: JSON.stringify(metadataObj),
            trace_id: options.traceId,
            span_id: options.spanId,
            parent_span_id: options.parentSpanId,
            exceptions: exceptions.length > 0 ? exceptions : undefined
        };

        await this.sendEvent(event);
    }

    private async sendEvent(event: Event): Promise<void> {
        try {
            // Use keepalive to ensure event sends even if navigating away
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event),
                keepalive: true
            });

            if (!response.ok) {
                // We use originalConsoleError if we hooked console.error to avoid infinite loops
                const logErr = this.originalConsoleError || console.error;
                logErr(`DevTrace: Failed to send event. Status: ${response.status}`);
            }
        } catch (error) {
            const logErr = this.originalConsoleError || console.error;
            logErr(`DevTrace: Error sending event to collector`, error);
        }
    }
}
