import { useState } from 'react';
import { format } from 'date-fns';
import {
    Bug, X, ChevronRight, Clock, Server, Globe, Hash, Code,
    Layers, PlaySquare, Filter, FileCode
} from 'lucide-react';
import type { Event, StackFrame } from './Timeline';
import { ReplayPlayer } from './ReplayPlayer';

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
    const [activeTab, setActiveTab] = useState<'overview' | 'exceptions' | 'replay' | 'metadata'>('overview');
    const [showReplayModal, setShowReplayModal] = useState(false);
    const [hideVendorFrames, setHideVendorFrames] = useState(true);
    const [selectedFrame, setSelectedFrame] = useState<StackFrame | null>(
        event.exceptions?.[0]?.stack_trace?.[0] || null
    );

    const cls = getSeverityClasses(event.severity, event.type);

    let parsedMetadata: Record<string, any> | null = null;
    try { if (event.metadata) parsedMetadata = JSON.parse(event.metadata); } catch { /**/ }

    const hasExceptions = (event.exceptions?.length ?? 0) > 0;
    const hasBreadcrumbs = (event.breadcrumbs?.length ?? 0) > 0 || event.session_id !== undefined;

    const tabs = [
        { id: 'overview' as const, label: 'Overview', icon: <Layers size={13} /> },
        ...(hasExceptions ? [{ id: 'exceptions' as const, label: `Exceptions (${event.exceptions!.length})`, icon: <Bug size={13} /> }] : []),
        ...(hasBreadcrumbs ? [{ id: 'replay' as const, label: `Replay & Breadcrumbs (${event.breadcrumbs?.length || 0})`, icon: <PlaySquare size={13} /> }] : []),
        ...(parsedMetadata ? [{ id: 'metadata' as const, label: 'Metadata', icon: <Code size={13} /> }] : []),
    ];

    // Filter vendor frames
    const filterFrames = (frames: StackFrame[]) => {
        if (!hideVendorFrames) return frames;
        const appFrames = frames.filter(f => !f.filename.includes('node_modules') && !f.filename.includes('react-dom'));
        return appFrames.length > 0 ? appFrames : frames;
    };

    return (
        <>
            <div
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
                style={{ backgroundColor: 'rgba(67,89,113,0.5)', backdropFilter: 'blur(4px)' }}
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            >
                <div className="bg-surface w-full sm:rounded-lg shadow-modal sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col border-t sm:border border-border rounded-t-2xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0 bg-sidebar/5">
                        <div className="min-w-0 pr-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={cls.badge + ' capitalize'}>{event.type}</span>
                                {event.severity && event.severity !== 'info' && (
                                    <span className={cls.badge + ' capitalize'}>{event.severity}</span>
                                )}
                                {event.service && <span className="badge badge-primary">{event.service}</span>}
                                {event.environment && <span className="badge badge-secondary">{event.environment}</span>}
                                {event.session_id && (
                                    <span className="badge badge-info font-mono text-[10px]">
                                        {event.session_id}
                                    </span>
                                )}
                            </div>
                            <p className="text-text-heading font-semibold text-base mt-2 leading-snug break-words">
                                {event.payload || `${event.type} event`}
                            </p>
                            <p className="text-xs text-text-muted mt-0.5">
                                {format(new Date(event.timestamp), 'MMM d, yyyy HH:mm:ss.SSS')}
                            </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {/* Quick Launch Replay Button */}
                            {hasBreadcrumbs && (
                                <button
                                    onClick={() => setShowReplayModal(true)}
                                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-sm"
                                    title="Launch interactive causality replay"
                                >
                                    <PlaySquare size={14} />
                                    <span>Launch Replay</span>
                                </button>
                            )}

                            <button
                                onClick={onClose}
                                className="text-text-muted hover:text-text-heading p-1.5 hover:bg-body rounded-md transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    {tabs.length > 1 && (
                        <div className="flex border-b border-border px-6 shrink-0 bg-surface">
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
                            <div className="space-y-5">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <InfoRow icon={<Hash size={13} />} label="Event ID" value={event.id} mono />
                                    <InfoRow icon={<Clock size={13} />} label="Timestamp" value={format(new Date(event.timestamp), 'PPpp')} />
                                    {event.service && <InfoRow icon={<Server size={13} />} label="Service" value={event.service} />}
                                    {event.environment && <InfoRow icon={<Globe size={13} />} label="Environment" value={event.environment} />}
                                    {event.trace_id && <InfoRow icon={<Hash size={13} />} label="Trace ID" value={event.trace_id} mono />}
                                    {event.session_id && <InfoRow icon={<Hash size={13} />} label="Session ID" value={event.session_id} mono />}
                                </div>

                                {event.payload && (
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Payload</p>
                                        <div className="bg-body border border-border rounded-md p-3 text-sm text-text-heading font-mono text-xs">
                                            {event.payload}
                                        </div>
                                    </div>
                                )}

                                {hasExceptions && (
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Exception</p>
                                        <div className="bg-danger-light border border-danger/20 rounded-md p-4">
                                            <p className="font-mono font-semibold text-danger text-sm">{event.exceptions![0].type}</p>
                                            <p className="text-sm text-danger/80 mt-1">{event.exceptions![0].message}</p>
                                            <div className="flex items-center gap-3 mt-3">
                                                <button
                                                    className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                                                    onClick={() => setActiveTab('exceptions')}
                                                >
                                                    Inspect Stack Frames ({event.exceptions![0].stack_trace.length}) <ChevronRight size={11} />
                                                </button>
                                                {hasBreadcrumbs && (
                                                    <button
                                                        className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                                                        onClick={() => setActiveTab('replay')}
                                                    >
                                                        View Causality Breadcrumbs <ChevronRight size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Exceptions with Interactive Stack Trace & Code Preview */}
                        {activeTab === 'exceptions' && event.exceptions && (
                            <div className="space-y-6">
                                {event.exceptions.map(exc => {
                                    const displayedFrames = filterFrames(exc.stack_trace || []);
                                    return (
                                        <div key={exc.id} className="space-y-4">
                                            {/* Exception banner */}
                                            <div className="bg-danger-light border border-danger/20 rounded-md p-4 flex items-center justify-between">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Bug size={15} className="text-danger" />
                                                        <span className="font-mono font-bold text-danger text-sm">{exc.type}</span>
                                                    </div>
                                                    <p className="text-sm text-danger/90 font-medium">{exc.message}</p>
                                                </div>

                                                <button
                                                    onClick={() => setHideVendorFrames(h => !h)}
                                                    className="btn-outline text-xs px-2.5 py-1 flex items-center gap-1 bg-surface shrink-0"
                                                >
                                                    <Filter size={12} />
                                                    <span>{hideVendorFrames ? 'Show Vendor Frames' : 'Hide Vendor Frames'}</span>
                                                </button>
                                            </div>

                                            {/* Code Preview Mockup */}
                                            {selectedFrame && (
                                                <div className="bg-[#1E1E2E] rounded-lg border border-white/10 overflow-hidden shadow-sm">
                                                    <div className="bg-[#181825] px-4 py-2 border-b border-white/10 flex items-center justify-between text-xs text-white/60">
                                                        <div className="flex items-center gap-2 truncate">
                                                            <FileCode size={14} className="text-primary" />
                                                            <span className="font-mono text-white/80 truncate">{selectedFrame.filename}</span>
                                                        </div>
                                                        <span className="font-mono text-primary font-semibold">Line {selectedFrame.line}</span>
                                                    </div>
                                                    <div className="p-3 font-mono text-xs text-white/80 leading-6 overflow-x-auto">
                                                        <div className="flex gap-4 opacity-50 px-2 py-0.5">
                                                            <span className="w-8 select-none text-right">{Math.max(1, selectedFrame.line - 2)}</span>
                                                            <span>// Call execution context</span>
                                                        </div>
                                                        <div className="flex gap-4 opacity-70 px-2 py-0.5">
                                                            <span className="w-8 select-none text-right">{Math.max(1, selectedFrame.line - 1)}</span>
                                                            <span>function {selectedFrame.function || 'handleAction'}() &#123;</span>
                                                        </div>
                                                        <div className="flex gap-4 bg-danger/20 text-white font-semibold px-2 py-0.5 rounded border-l-4 border-danger">
                                                            <span className="w-8 select-none text-right text-danger font-bold">{selectedFrame.line}</span>
                                                            <span className="flex items-center gap-2">
                                                                <span>&gt; throw new Error("{exc.message.substring(0, 50)}");</span>
                                                                <Bug size={13} className="text-danger inline shrink-0" />
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-4 opacity-70 px-2 py-0.5">
                                                            <span className="w-8 select-none text-right">{selectedFrame.line + 1}</span>
                                                            <span>&#125;</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Stack Frames List */}
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                                                    Stack Trace Frames ({displayedFrames.length} displayed)
                                                </p>
                                                <div className="bg-[#282C34] rounded-lg overflow-x-auto p-3 text-xs font-mono leading-6 divide-y divide-white/5">
                                                    {displayedFrames.map((frame, i) => {
                                                        const isSelected = selectedFrame === frame;
                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => setSelectedFrame(frame)}
                                                                className={`flex gap-2 px-2 py-1 rounded cursor-pointer transition-colors whitespace-nowrap ${
                                                                    isSelected
                                                                        ? 'bg-primary/25 text-white ring-1 ring-primary'
                                                                        : 'text-[#ABB2BF] hover:bg-white/5'
                                                                }`}
                                                            >
                                                                <span className="text-[#5C6370] select-none w-5 text-right shrink-0">{i + 1}</span>
                                                                <span className="text-[#5C6370]">at</span>
                                                                <span className="text-[#E5C07B] font-semibold">{frame.function || '<anonymous>'}</span>
                                                                <span className="text-[#5C6370]">(
                                                                    <span className="text-[#61AFEF] hover:underline">{frame.filename}</span>
                                                                    <span className="text-[#5C6370]">:{frame.line}:{frame.column}</span>
                                                                )</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Replay & Breadcrumbs Tab */}
                        {activeTab === 'replay' && (
                            <div className="space-y-4">
                                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
                                    <div>
                                        <h4 className="font-semibold text-text-heading text-sm">Interactive Session Replay</h4>
                                        <p className="text-xs text-text-muted mt-0.5">
                                            Step through user actions and HTTP requests prior to this error
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowReplayModal(true)}
                                        className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 shadow"
                                    >
                                        <PlaySquare size={15} />
                                        <span>Open Full Player</span>
                                    </button>
                                </div>

                                <ReplayPlayer event={event} autoPlay={false} />
                            </div>
                        )}

                        {/* Metadata Tab */}
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

            {/* Fullscreen Replay Modal Popup */}
            {showReplayModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
                    style={{ backgroundColor: 'rgba(20,24,33,0.85)', backdropFilter: 'blur(8px)' }}
                >
                    <div className="w-full max-w-5xl">
                        <ReplayPlayer event={event} onClose={() => setShowReplayModal(false)} autoPlay={true} />
                    </div>
                </div>
            )}
        </>
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
