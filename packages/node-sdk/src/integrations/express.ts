import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DevTrace } from '../client';

/**
 * devtraceExpressMiddleware — request tracking middleware.
 * Captures every HTTP request as a `trace` event with method, path,
 * status code, and duration. Attach BEFORE your routes.
 *
 * Usage:
 *   const devtrace = new DevTrace({ projectId: '...' });
 *   app.use(devtraceExpressMiddleware(devtrace));
 */
export function devtraceExpressMiddleware(client: DevTrace) {
    return function (req: Request, res: Response, next: NextFunction) {
        const traceId = uuidv4();
        const spanId = uuidv4();
        const startTime = Date.now();

        // Attach trace context to request so error handler can read it
        (req as any).__devtrace = { traceId, spanId, startTime };
        res.locals.__devtraceTraceId = traceId;
        res.locals.__devtraceSpanId = spanId;

        // Intercept res.end to capture response details
        const originalEnd = res.end.bind(res);
        (res as any).end = function (...args: any[]) {
            const durationMs = Date.now() - startTime;
            const status = res.statusCode;
            const isError = status >= 500;

            // Fire trace event (don't await — non-blocking)
            client.trace(`${req.method} ${req.path}`, {
                traceId,
                spanId,
                timestamp: startTime,
                durationMs,
                metadata: {
                    method: req.method,
                    path: req.path,
                    status,
                    query: req.query,
                },
                severity: isError ? 'error' : 'info',
            });

            return originalEnd(...args);
        };

        client.runWithTrace(traceId, spanId, () => {
            next();
        });
    };
}

/**
 * devtraceExpressErrorHandler — error-handling middleware.
 * Captures thrown errors with the trace context from the request.
 * Attach AFTER your routes.
 *
 * Usage:
 *   app.use(devtraceExpressErrorHandler(devtrace));
 */
export function devtraceExpressErrorHandler(client: DevTrace) {
    return async function (err: Error, req: Request, res: Response, next: NextFunction) {
        const ctx = (req as any).__devtrace || {};
        await client.captureError(err, {
            traceId: ctx.traceId,
            spanId: uuidv4(),
            parentSpanId: ctx.spanId,
            metadata: {
                url: req.url,
                method: req.method,
                status: res.statusCode,
                query: req.query,
            },
        });
        next(err);
    };
}
