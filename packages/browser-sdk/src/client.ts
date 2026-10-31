import { v4 as uuidv4 } from 'uuid';
import ErrorStackParser from 'error-stack-parser';
import { Breadcrumb, DevTraceBrowserOptions, Event, Exception, LogOptions, StackFrame } from './types';

export class DevTraceBrowser {
    private options: Required<DevTraceBrowserOptions>;
    private endpoint: string;
    private originalConsoleError: typeof console.error | null = null;
    private originalFetch: typeof window.fetch | null = null;
    private initialized = false;
    private sessionId: string;
    private breadcrumbs: Breadcrumb[] = [];

    constructor(options: DevTraceBrowserOptions) {
        if (!options.projectId) {
            throw new Error('DevTrace: projectId is required');
        }

        let existingSession = options.sessionId;
        if (!existingSession && typeof window !== 'undefined' && window.sessionStorage) {
            try {
                existingSession = window.sessionStorage.getItem('devtrace_session_id') || undefined;
                if (!existingSession) {
                    existingSession = `sess_${uuidv4().substring(0, 8)}`;
                    window.sessionStorage.setItem('devtrace_session_id', existingSession);
                }
            } catch {
                existingSession = `sess_${uuidv4().substring(0, 8)}`;
            }
        }

        this.sessionId = existingSession || `sess_${uuidv4().substring(0, 8)}`;

        this.options = {
            projectId: options.projectId,
            collectorUrl: options.collectorUrl || 'http://localhost:4310',
            service: options.service || 'unknown-browser-app',
            environment: options.environment || 'development',
            captureConsoleErrors: options.captureConsoleErrors ?? false,
            enableBreadcrumbs: options.enableBreadcrumbs ?? true,
            maxBreadcrumbs: options.maxBreadcrumbs || 50,
            sessionId: this.sessionId,
        };

        this.endpoint = this.options.collectorUrl.endsWith('/') 
            ? `${this.options.collectorUrl}api/v1/events` 
            : `${this.options.collectorUrl}/api/v1/events`;
    }

    /**
     * Get the current active session ID.
     */
    public getSessionId(): string {
        return this.sessionId;
    }

    /**
     * Get the recorded breadcrumb trail.
     */
    public getBreadcrumbs(): Breadcrumb[] {
        return [...this.breadcrumbs];
    }

    /**
     * Clear all recorded breadcrumbs.
     */
    public clearBreadcrumbs(): void {
        this.breadcrumbs = [];
    }

    /**
     * Manually add a breadcrumb to the session replay timeline.
     */
    public addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
        const item: Breadcrumb = {
            ...breadcrumb,
            timestamp: Date.now()
        };
        this.breadcrumbs.push(item);
        if (this.breadcrumbs.length > this.options.maxBreadcrumbs) {
            this.breadcrumbs.shift();
        }
    }

    /**
     * Initialize global error handlers and breadcrumb observers.
     */
    public init() {
        if (this.initialized || typeof window === 'undefined') return;
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

        if (this.options.enableBreadcrumbs) {
            this.setupBreadcrumbListeners();
        }
    }

    private setupBreadcrumbListeners() {
        // 1. Initial navigation breadcrumb
        this.addBreadcrumb({
            category: 'navigation',
            message: `Page loaded: ${window.location.pathname}`,
            level: 'info',
            data: { url: window.location.href, title: document.title }
        });

        // 2. Click tracking (UI clicks)
        document.addEventListener('click', (event: MouseEvent) => {
            try {
                const target = event.target as HTMLElement | null;
                if (!target) return;

                const tag = target.tagName ? target.tagName.toLowerCase() : 'element';
                const id = target.id ? `#${target.id}` : '';
                const role = target.getAttribute('role') ? `[role="${target.getAttribute('role')}"]` : '';
                const classes = target.className && typeof target.className === 'string'
                    ? `.${target.className.trim().split(/\s+/).slice(0, 2).join('.')}`
                    : '';
                
                // Extract inner text or value (truncated to 40 chars)
                let text = '';
                if ('innerText' in target && typeof target.innerText === 'string') {
                    text = target.innerText.trim().replace(/\s+/g, ' ').substring(0, 40);
                } else if ('value' in target && typeof (target as any).value === 'string') {
                    text = (target as any).value.trim().substring(0, 40);
                }

                const label = text ? `"${text}"` : `${tag}${id}${classes}${role}`;

                this.addBreadcrumb({
                    category: 'ui.click',
                    message: `Clicked ${tag} ${label}`,
                    level: 'info',
                    data: {
                        tag,
                        id: target.id || undefined,
                        text: text || undefined,
                        path: window.location.pathname
                    }
                });
            } catch {
                // Safeguard against DOM inspection errors
            }
        }, true);

        // 3. Navigation / URL changes
        window.addEventListener('popstate', () => {
            this.addBreadcrumb({
                category: 'navigation',
                message: `Navigated to ${window.location.pathname}`,
                level: 'info',
                data: { url: window.location.href }
            });
        });

        const originalPushState = history.pushState;
        if (originalPushState) {
            history.pushState = (...args) => {
                originalPushState.apply(history, args);
                this.addBreadcrumb({
                    category: 'navigation',
                    message: `Navigated to ${window.location.pathname}`,
                    level: 'info',
                    data: { url: window.location.href }
                });
            };
        }

        // 4. Fetch tracking (excluding collector endpoint)
        if (window.fetch) {
            this.originalFetch = window.fetch;
            window.fetch = async (...args: Parameters<typeof fetch>) => {
                const [resource, config] = args;
                const url = typeof resource === 'string' ? resource : resource instanceof URL ? resource.toString() : (resource as Request)?.url || '';
                const method = (config?.method || (resource as Request)?.method || 'GET').toUpperCase();

                // Skip logging requests made to the DevTrace collector itself
                const isCollectorUrl = url.includes(this.options.collectorUrl) || url.includes('/api/v1/events');
                if (isCollectorUrl) {
                    return this.originalFetch!.apply(window, args);
                }

                const startTime = Date.now();
                try {
                    const response = await this.originalFetch!.apply(window, args);
                    const duration = Date.now() - startTime;
                    this.addBreadcrumb({
                        category: 'http',
                        message: `${method} ${url.substring(0, 60)} -> ${response.status}`,
                        level: response.ok ? 'info' : 'warning',
                        data: {
                            method,
                            url,
                            status: response.status,
                            durationMs: duration
                        }
                    });
                    return response;
                } catch (err: any) {
                    const duration = Date.now() - startTime;
                    this.addBreadcrumb({
                        category: 'http',
                        message: `${method} ${url.substring(0, 60)} -> FAILED (${err?.message || 'NetworkError'})`,
                        level: 'error',
                        data: {
                            method,
                            url,
                            error: err?.message,
                            durationMs: duration
                        }
                    });
                    throw err;
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
        // Also record as console breadcrumb
        if (this.options.enableBreadcrumbs) {
            this.addBreadcrumb({
                category: 'console',
                message: message.substring(0, 100),
                level: options.severity === 'error' ? 'error' : options.severity === 'warning' ? 'warning' : 'info',
            });
        }

        const event: Event = {
            id: uuidv4(),
            project_id: this.options.projectId,
            timestamp: Date.now(),
            type: 'log',
            severity: options.severity || 'info',
            service: this.options.service,
            environment: this.options.environment,
            payload: message,
            session_id: options.sessionId || this.sessionId,
            metadata: options.metadata ? JSON.stringify({ ...options.metadata, url: window.location.href, userAgent: navigator.userAgent }) : JSON.stringify({ url: window.location.href, userAgent: navigator.userAgent }),
            trace_id: options.traceId,
            span_id: options.spanId,
            parent_span_id: options.parentSpanId
        };

        await this.sendEvent(event);
    }

    /**
     * Capture an error and its stack trace with the recorded session replay breadcrumbs.
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
            } catch {
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
            } catch {
                // Ignore serialization errors
            }
        }

        const metadataObj = options.metadata || {};
        metadataObj.url = window.location.href;
        metadataObj.userAgent = navigator.userAgent;

        // Take a snapshot of breadcrumbs for replay
        const breadcrumbSnapshot = this.getBreadcrumbs();

        const event: Event = {
            id: errorEventId,
            project_id: this.options.projectId,
            timestamp: Date.now(),
            type: 'error',
            severity: options.severity || 'error',
            service: this.options.service,
            environment: this.options.environment,
            payload: message,
            session_id: options.sessionId || this.sessionId,
            metadata: JSON.stringify(metadataObj),
            trace_id: options.traceId,
            span_id: options.spanId,
            parent_span_id: options.parentSpanId,
            exceptions: exceptions.length > 0 ? exceptions : undefined,
            breadcrumbs: breadcrumbSnapshot.length > 0 ? breadcrumbSnapshot : undefined,
        };

        await this.sendEvent(event);
    }

    private async sendEvent(event: Event): Promise<void> {
        try {
            const fetchFn = this.originalFetch || fetch;
            const response = await fetchFn(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event),
                keepalive: true
            });

            if (!response.ok) {
                const logErr = this.originalConsoleError || console.error;
                logErr(`DevTrace: Failed to send event. Status: ${response.status}`);
            }
        } catch (error) {
            const logErr = this.originalConsoleError || console.error;
            logErr(`DevTrace: Error sending event to collector`, error);
        }
    }
}
