import { v4 as uuidv4 } from 'uuid';
import { DevTrace } from '../client';

/**
 * devtraceFastifyPlugin — Fastify plugin for auto-instrumentation.
 * Captures every request as a trace event and errors as error events.
 *
 * Usage:
 *   const devtrace = new DevTrace({ projectId: '...' });
 *   await fastify.register(devtraceFastifyPlugin, { client: devtrace });
 */
export async function devtraceFastifyPlugin(
    fastify: any,
    options: { client: DevTrace }
) {
    const { client } = options;

    fastify.addHook('onRequest', async (request: any, _reply: any) => {
        const traceId = uuidv4();
        const spanId = uuidv4();
        request.__devtrace = { traceId, spanId, startTime: Date.now() };
    });

    fastify.addHook('onResponse', async (request: any, reply: any) => {
        const ctx = request.__devtrace || {};
        const durationMs = Date.now() - (ctx.startTime || Date.now());
        const status = reply.statusCode;

        await client.trace(`${request.method} ${request.url}`, {
            traceId: ctx.traceId,
            spanId: ctx.spanId,
            metadata: {
                method: request.method,
                path: request.url,
                status,
                duration_ms: durationMs,
                query: request.query,
            },
            severity: status >= 500 ? 'error' : 'info',
        });
    });

    fastify.addHook('onError', async (request: any, _reply: any, error: Error) => {
        const ctx = request.__devtrace || {};
        await client.captureError(error, {
            traceId: ctx.traceId,
            spanId: uuidv4(),
            parentSpanId: ctx.spanId,
            metadata: {
                method: request.method,
                path: request.url,
                query: request.query,
            },
        });
    });
}
