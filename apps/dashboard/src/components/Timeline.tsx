import { useState } from 'react';
import { format } from 'date-fns';
import {
    Bug, Activity, Info, AlertTriangle, ChevronRight,
    Clock, Code,
} from 'lucide-react';
import { EventDetailModal } from './EventDetailModal';

export interface StackFrame {
    filename: string;
    function: string;
    line: number;
    column: number;
}

export interface Exception {
    id: string;
    event_id: string;
    type: string;
    message: string;
    stack_trace: StackFrame[];
}

export interface Event {
    id: string;
    project_id: string;
    timestamp: number;
    type: string;
    severity?: string;
    service?: string;
    environment?: string;
    trace_id?: string;
    span_id?: string;
    parent_span_id?: string;
    duration_ms?: number;
    payload?: string;
    metadata?: string;
    created_at: number;
    exceptions?: Exception[];
}

interface TimelineProps {
    events: Event[];
    allEventsCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSeverityIcon(severity?: string, type?: string) {
    if (type === 'error' || severity === 'error' || severity === 'critical') return <Bug size={14} />;
    if (severity === 'warning') return <AlertTriangle size={14} />;
    if (type === 'trace') return <Activity size={14} />;
    return <Info size={14} />;
}

function getSeverityClasses(severity?: string, type?: string) {
    if (type === 'error' || severity === 'error' || severity === 'critical')
        return { dot: 'text-danger bg-danger-light border-danger/30', badge: 'badge badge-danger' };
    if (severity === 'warning')
        return { dot: 'text-warning bg-warning-light border-warning/30', badge: 'badge badge-warning' };
    if (type === 'trace')
        return { dot: 'text-success bg-success-light border-success/30', badge: 'badge badge-success' };
    return { dot: 'text-info bg-info-light border-info/30', badge: 'badge badge-info' };
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export function Timeline({ events, allEventsCount }: TimelineProps) {
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

    if (events.length === 0) {
        return (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
                <Activity size={44} className="text-border mb-4" />
                <p className="font-medium text-text-heading">
                    {allEventsCount === 0 ? 'No events yet.' : 'No events match your filters.'}
                </p>
                <p className="text-sm text-text-muted mt-1">
                    {allEventsCount === 0
                        ? 'Start firing some events to see them here.'
                        : 'Try adjusting your search or filter.'}
                </p>
            </div>
        );
    }

    return (
        <>
            {selectedEvent && (
                <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            )}

            <div className="relative space-y-3">
                {events.map(event => {
                    const cls = getSeverityClasses(event.severity, event.type);
                    const hasExceptions = (event.exceptions?.length ?? 0) > 0;

                    return (
                        <div
                            key={event.id}
                            className="card p-4 flex gap-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
                            onClick={() => setSelectedEvent(event)}
                        >
                            {/* Dot */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${cls.dot} mt-0.5 transition-transform group-hover:scale-105`}>
                                {getSeverityIcon(event.severity, event.type)}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className={cls.badge + ' capitalize'}>{event.type}</span>
                                    {event.service && <span className="badge badge-primary">{event.service}</span>}
                                    {event.severity && event.severity !== 'info' && (
                                        <span className={cls.badge + ' capitalize'}>{event.severity}</span>
                                    )}
                                    {event.environment && <span className="badge badge-secondary">{event.environment}</span>}
                                </div>

                                {event.payload && (
                                    <p className="text-sm text-text-heading font-medium truncate">{event.payload}</p>
                                )}

                                {hasExceptions && (
                                    <div className="mt-2 bg-danger-light border border-danger/20 rounded-md p-2.5">
                                        <p className="text-xs font-mono font-semibold text-danger">{event.exceptions![0].type}</p>
                                        <p className="text-xs text-danger/80 mt-0.5">{event.exceptions![0].message}</p>
                                        {event.exceptions![0].stack_trace?.length > 0 && (
                                            <div className="mt-2 bg-[#1E222A] rounded p-2 text-[10px] font-mono text-[#ABB2BF] space-y-0.5">
                                                {event.exceptions![0].stack_trace.slice(0, 2).map((f, i) => (
                                                    <div key={i} className="truncate">
                                                        <span className="text-[#5C6370]">at </span>
                                                        <span className="text-[#E5C07B]">{f.function || '<anonymous>'}</span>
                                                        <span className="text-[#5C6370]"> ({f.filename}:{f.line})</span>
                                                    </div>
                                                ))}
                                                {event.exceptions![0].stack_trace.length > 2 && (
                                                    <p className="text-[#5C6370]">... +{event.exceptions![0].stack_trace.length - 2} more frames</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
                                    <span className="flex items-center gap-1">
                                        <Clock size={10} />
                                        {format(new Date(event.timestamp), 'MMM d, HH:mm:ss.SSS')}
                                    </span>
                                    <span className="font-mono">#{event.id.substring(0, 8)}</span>
                                    {event.metadata && <span className="flex items-center gap-0.5"><Code size={10} /> metadata</span>}
                                </div>
                            </div>

                            <ChevronRight size={16} className="text-border group-hover:text-primary transition-colors shrink-0 self-center" />
                        </div>
                    );
                })}
            </div>
        </>
    );
}
