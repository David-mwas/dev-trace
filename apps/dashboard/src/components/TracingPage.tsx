import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Activity, ChevronRight, GitBranch, Clock, AlertTriangle, Info } from 'lucide-react';
import { EventDetailModal } from './EventDetailModal';
import type { Event } from './Timeline';

interface TracingPageProps {
    events: Event[];
}

interface Span {
    event: Event;
    depth: number;
    startOffset: number; // ms from trace start
    width: number;       // relative width 0-100%
}

interface TraceGroup {
    traceId: string;
    spans: Span[];
    startTime: number;
    endTime: number;
    hasError: boolean;
    services: string[];
}

function buildTraceGroups(events: Event[]): TraceGroup[] {
    // Group by trace_id
    const byTrace: Record<string, Event[]> = {};
    events.forEach(e => {
        if (!e.trace_id) return;
        if (!byTrace[e.trace_id]) byTrace[e.trace_id] = [];
        byTrace[e.trace_id].push(e);
    });

    return Object.entries(byTrace).map(([traceId, evts]) => {
        // Sort by timestamp
        const sorted = [...evts].sort((a, b) => a.timestamp - b.timestamp);
        const startTime = sorted[0].timestamp;
        
        let maxEndTime = startTime;
        sorted.forEach(e => {
            const end = e.timestamp + (e.duration_ms || 20);
            if (end > maxEndTime) maxEndTime = end;
        });
        const endTime = maxEndTime;
        const totalDuration = Math.max(endTime - startTime, 1);

        // Build span tree
        const spanById: Record<string, Span> = {};
        const spans: Span[] = sorted.map(e => {
            const startOffset = e.timestamp - startTime;
            const span: Span = {
                event: e,
                depth: 0,
                startOffset,
                width: 0,
            };
            if (e.span_id) spanById[e.span_id] = span;
            return span;
        });

        // Calculate depths
        spans.forEach(span => {
            if (span.event.parent_span_id && spanById[span.event.parent_span_id]) {
                span.depth = spanById[span.event.parent_span_id].depth + 1;
            }
        });

        // Calculate widths
        spans.forEach((span) => {
            const dur = span.event.duration_ms || 20;
            span.width = Math.max((dur / totalDuration) * 100, 1);
        });

        return {
            traceId,
            spans,
            startTime,
            endTime,
            hasError: sorted.some(e => e.type === 'error' || e.severity === 'error'),
            services: [...new Set(sorted.map(e => e.service).filter(Boolean))] as string[],
        };
    }).sort((a, b) => b.startTime - a.startTime); // newest first
}

function SpanBar({ span, totalMs }: { span: Span; totalMs: number }) {
    const colors: Record<string, string> = {
        error: 'bg-danger',
        trace: 'bg-success',
        log: 'bg-info',
    };
    const color = colors[span.event.type] || 'bg-primary';
    const leftPct = totalMs > 0 ? (span.startOffset / totalMs) * 100 : 0;

    return (
        <div
            className="absolute top-1/2 -translate-y-1/2 h-4 rounded-sm opacity-80 hover:opacity-100 transition-opacity"
            style={{
                left: `${Math.min(leftPct, 98)}%`,
                width: `${Math.max(span.width, 2)}%`,
            }}
        >
            <div className={`h-full rounded-sm ${color}`} />
        </div>
    );
}

export function TracingPage({ events }: TracingPageProps) {
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

    const traces = useMemo(() => buildTraceGroups(events), [events]);

    if (traces.length === 0) {
        return (
            <div className="card p-12 text-center">
                <GitBranch size={44} className="mx-auto mb-3 opacity-20" />
                <p className="font-semibold text-text-heading">No distributed traces yet</p>
                <p className="text-sm text-text-muted mt-2 max-w-md mx-auto">
                    Set a <code className="font-mono bg-body px-1 rounded text-xs">traceId</code> on your events using the Express middleware or by passing it manually to see waterfall traces here.
                </p>
                <div className="mt-4 bg-body border border-border rounded-md p-3 text-xs font-mono text-text-heading text-left max-w-sm mx-auto">
                    <span className="text-text-muted">// Express — auto-instrumented</span><br />
                    app.use(devtraceExpressMiddleware(client));
                </div>
            </div>
        );
    }

    return (
        <>
            {selectedEvent && (
                <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            )}
            <div className="space-y-3">
                {traces.map(trace => {
                    const durationMs = trace.endTime - trace.startTime;
                    const isExpanded = expandedTrace === trace.traceId;

                    return (
                        <div key={trace.traceId} className="card overflow-hidden">
                            {/* Trace header */}
                            <button
                                className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-body transition-colors"
                                onClick={() => setExpandedTrace(isExpanded ? null : trace.traceId)}
                            >
                                <div className={`w-2 h-2 rounded-full shrink-0 ${trace.hasError ? 'bg-danger' : 'bg-success'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs text-text-heading font-semibold">
                                            {trace.traceId.substring(0, 16)}…
                                        </span>
                                        {trace.services.map(s => (
                                            <span key={s} className="badge badge-primary">{s}</span>
                                        ))}
                                        {trace.hasError && <span className="badge badge-danger">has error</span>}
                                    </div>
                                    <p className="text-xs text-text-muted mt-0.5">
                                        {format(new Date(trace.startTime), 'MMM d, HH:mm:ss')} · {trace.spans.length} spans
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs font-mono text-text-muted flex items-center gap-1">
                                        <Clock size={11} /> {durationMs}ms
                                    </span>
                                    <ChevronRight
                                        size={16}
                                        className={`text-border transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                    />
                                </div>
                            </button>

                            {/* Waterfall */}
                            {isExpanded && (
                                <div className="border-t border-border">
                                    {/* Timeline header */}
                                    <div className="px-5 py-2 bg-body border-b border-border flex items-center text-[10px] font-mono text-text-muted">
                                        <div className="w-64 shrink-0">Span</div>
                                        <div className="flex-1 flex justify-between">
                                            <span>0ms</span>
                                            <span>{Math.round(durationMs / 2)}ms</span>
                                            <span>{durationMs}ms</span>
                                        </div>
                                    </div>

                                    {trace.spans.map((span, i) => {
                                        const typeIcon = span.event.type === 'error' ? <AlertTriangle size={11} className="text-danger" />
                                            : span.event.type === 'trace' ? <Activity size={11} className="text-success" />
                                            : <Info size={11} className="text-info" />;

                                        return (
                                            <div
                                                key={span.event.id}
                                                className={`flex items-center border-b border-border/50 hover:bg-body cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-body/30'}`}
                                                onClick={() => setSelectedEvent(span.event)}
                                                style={{ height: '36px' }}
                                            >
                                                {/* Span label */}
                                                <div
                                                    className="w-64 shrink-0 px-5 flex items-center gap-2 min-w-0"
                                                    style={{ paddingLeft: `${20 + span.depth * 16}px` }}
                                                >
                                                    {typeIcon}
                                                    <span className="text-xs text-text-heading truncate">
                                                        {span.event.payload || span.event.type}
                                                    </span>
                                                </div>

                                                {/* Bar */}
                                                <div className="flex-1 relative h-full">
                                                    <SpanBar span={span} totalMs={durationMs} />
                                                </div>

                                                {/* Duration */}
                                                <div className="w-16 text-right pr-3 text-[10px] font-mono text-text-muted">
                                                    {span.event.timestamp - trace.startTime}ms
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
