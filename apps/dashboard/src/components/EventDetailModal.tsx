import { useState } from 'react';
import { format } from 'date-fns';
import {
    Bug, Activity, Info, AlertTriangle, X, ChevronRight,
    Clock, Server, Globe, Hash, Code, Layers,
} from 'lucide-react';
import type { Event } from './Timeline';

function getSeverityClasses(severity?: string, type?: string) {
    if (type === 'error' || severity === 'error' || severity === 'critical')
        return { dot: 'text-danger bg-danger-light border-danger/30', badge: 'badge badge-danger' };
    if (severity === 'warning')
        return { dot: 'text-warning bg-warning-light border-warning/30', badge: 'badge badge-warning' };
    if (type === 'trace')
        return { dot: 'text-success bg-success-light border-success/30', badge: 'badge badge-success' };
    return { dot: 'text-info bg-info-light border-info/30', badge: 'badge badge-info' };
}

export function EventDetailModal({ event, onClose }: { event: Event; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<'overview' | 'exceptions' | 'metadata'>('overview');
    const cls = getSeverityClasses(event.severity, event.type);

    let parsedMetadata: Record<string, any> | null = null;
    try { if (event.metadata) parsedMetadata = JSON.parse(event.metadata); } catch { /**/ }

    const hasExceptions = (event.exceptions?.length ?? 0) > 0;
    const tabs = [
        { id: 'overview' as const, label: 'Overview', icon: <Layers size={13} /> },
        ...(hasExceptions ? [{ id: 'exceptions' as const, label: `Exceptions (${event.exceptions!.length})`, icon: <Bug size={13} /> }] : []),
        ...(parsedMetadata ? [{ id: 'metadata' as const, label: 'Metadata', icon: <Code size={13} /> }] : []),
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
            style={{ backgroundColor: 'rgba(67,89,113,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-surface w-full sm:rounded-lg shadow-modal sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col border-t sm:border border-border rounded-t-2xl">
                {/* Header */}
                <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={cls.badge + ' capitalize'}>{event.type}</span>
                            {event.severity && event.severity !== 'info' && (
                                <span className={cls.badge + ' capitalize'}>{event.severity}</span>
                            )}
                            {event.service && <span className="badge badge-primary">{event.service}</span>}
                            {event.environment && <span className="badge badge-secondary">{event.environment}</span>}
                        </div>
                        <p className="text-text-heading font-semibold text-base mt-2 leading-snug">
                            {event.payload || `${event.type} event`}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                            {format(new Date(event.timestamp), 'MMM d, yyyy HH:mm:ss.SSS')}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-text-muted hover:text-text-heading p-1.5 hover:bg-body rounded-md transition-colors ml-4 shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                {tabs.length > 1 && (
                    <div className="flex border-b border-border px-6 shrink-0">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-1 py-3 mr-6 text-xs font-semibold border-b-2 transition-colors ${
                                    activeTab === tab.id
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-text-muted hover:text-text-heading'
                                }`}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-6">

                    {/* Overview */}
                    {activeTab === 'overview' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <InfoRow icon={<Hash size={13} />} label="Event ID" value={event.id} mono />
                                <InfoRow icon={<Clock size={13} />} label="Timestamp" value={format(new Date(event.timestamp), 'PPpp')} />
                                {event.service && <InfoRow icon={<Server size={13} />} label="Service" value={event.service} />}
                                {event.environment && <InfoRow icon={<Globe size={13} />} label="Environment" value={event.environment} />}
                                {event.trace_id && <InfoRow icon={<Hash size={13} />} label="Trace ID" value={event.trace_id} mono />}
                                {event.span_id && <InfoRow icon={<Hash size={13} />} label="Span ID" value={event.span_id} mono />}
                            </div>
                            {event.payload && (
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Payload</p>
                                    <div className="bg-body border border-border rounded-md p-3 text-sm text-text-heading">
                                        {event.payload}
                                    </div>
                                </div>
                            )}
                            {hasExceptions && (
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Exception</p>
                                    <div className="bg-danger-light border border-danger/20 rounded-md p-3">
                                        <p className="font-mono font-semibold text-danger text-sm">{event.exceptions![0].type}</p>
                                        <p className="text-sm text-danger/80 mt-1">{event.exceptions![0].message}</p>
                                        {tabs.find(t => t.id === 'exceptions') && event.exceptions!.length > 0 && (
                                            <button
                                                className="mt-2 text-xs text-primary font-medium flex items-center gap-0.5 hover:underline"
                                                onClick={() => setActiveTab('exceptions')}
                                            >
                                                Full stack trace <ChevronRight size={11} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Exceptions */}
                    {activeTab === 'exceptions' && event.exceptions && (
                        <div className="space-y-5">
                            {event.exceptions.map(exc => (
                                <div key={exc.id} className="bg-danger-light border border-danger/20 rounded-md p-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Bug size={14} className="text-danger" />
                                        <span className="font-mono font-bold text-danger text-sm">{exc.type}</span>
                                    </div>
                                    <p className="text-sm text-danger/90 font-medium mb-3">{exc.message}</p>
                                    {exc.stack_trace?.length > 0 && (
                                        <div className="bg-[#282C34] rounded-md overflow-x-auto p-3 text-xs font-mono leading-6">
                                            {exc.stack_trace.map((frame, i) => (
                                                <div
                                                    key={i}
                                                    className={`flex gap-2 px-1 rounded whitespace-nowrap ${i === 0 ? 'bg-primary/20 text-white' : 'text-[#ABB2BF] hover:bg-white/5'}`}
                                                >
                                                    <span className="text-[#5C6370] select-none w-5 text-right shrink-0">{i + 1}</span>
                                                    <span className="text-[#5C6370]">at</span>
                                                    <span className="text-[#E5C07B]">{frame.function || '<anonymous>'}</span>
                                                    <span className="text-[#5C6370]">(
                                                        <span className="text-[#61AFEF]">{frame.filename}</span>
                                                        <span className="text-[#5C6370]">:{frame.line}:{frame.column}</span>
                                                    )</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Metadata */}
                    {activeTab === 'metadata' && parsedMetadata && (
                        <div>
                            {Object.entries(parsedMetadata).map(([key, value]) => (
                                <div key={key} className="flex gap-4 py-3 border-b border-border last:border-0">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-32 shrink-0 pt-0.5">{key}</span>
                                    <span className="text-sm text-text font-mono break-all">
                                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
    return (
        <div className="bg-body border border-border rounded-md p-3">
            <div className="flex items-center gap-1.5 text-text-muted mb-1">
                {icon}
                <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
            </div>
            <p className={`text-sm text-text-heading truncate ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value}</p>
        </div>
    );
}
