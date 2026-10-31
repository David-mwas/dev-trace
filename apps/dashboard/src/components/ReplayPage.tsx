import { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import {
    PlaySquare, Flame, Clock, Bug, RefreshCw, Laptop
} from 'lucide-react';
import { ReplayPlayer } from './ReplayPlayer';
import type { Event } from './Timeline';

interface SessionSummary {
    session_id: string;
    project_id: string;
    service: string;
    event_count: number;
    error_count: number;
    first_seen: number;
    last_seen: number;
    duration_ms: number;
    has_replay: boolean;
}

export function ReplayPage() {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [replayEvents, setReplayEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSession, setSelectedSession] = useState<string | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [sessionDetailEvents, setSessionDetailEvents] = useState<Event[]>([]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [sessRes, eventsRes] = await Promise.all([
                axios.get('http://localhost:4310/api/v1/sessions').catch(() => ({ data: [] })),
                axios.get('http://localhost:4310/api/v1/events?type=error').catch(() => ({ data: [] })),
            ]);

            setSessions(sessRes.data || []);
            const allErrors: Event[] = eventsRes.data || [];
            setReplayEvents(allErrors);

            // Default select the first session or error if available
            if (allErrors.length > 0 && !selectedEvent && !selectedSession) {
                setSelectedEvent(allErrors[0]);
            }
        } catch {
            // handle gracefully
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSelectSession = async (sessionId: string) => {
        setSelectedSession(sessionId);
        setSelectedEvent(null);
        try {
            const res = await axios.get(`http://localhost:4310/api/v1/events?session_id=${sessionId}`);
            setSessionDetailEvents(res.data || []);
        } catch {
            setSessionDetailEvents([]);
        }
    };

    const handleSelectEvent = (event: Event) => {
        setSelectedEvent(event);
        setSelectedSession(null);
        setSessionDetailEvents([]);
    };

    const totalErrors = sessions.reduce((acc, s) => acc + s.error_count, 0);

    return (
        <div className="space-y-6">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <PlaySquare size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-text-muted font-semibold uppercase">Total Sessions</p>
                        <p className="text-xl font-bold text-text-heading">{sessions.length || 1}</p>
                    </div>
                </div>

                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-danger/10 border border-danger/20 flex items-center justify-center text-danger">
                        <Flame size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-text-muted font-semibold uppercase">Error Replays</p>
                        <p className="text-xl font-bold text-text-heading">{totalErrors || replayEvents.length}</p>
                    </div>
                </div>

                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center text-success">
                        <Clock size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-text-muted font-semibold uppercase">Telemetry Mode</p>
                        <p className="text-sm font-bold text-text-heading">Auto Breadcrumbs Active</p>
                    </div>
                </div>
            </div>

            {/* Active Replay Player View */}
            {(selectedEvent || (selectedSession && sessionDetailEvents.length > 0)) && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Currently Playing</span>
                            <span className="font-semibold text-text-heading text-sm">
                                {selectedEvent ? selectedEvent.payload : `Session ${selectedSession}`}
                            </span>
                        </div>
                    </div>

                    <ReplayPlayer
                        event={selectedEvent}
                        sessionEvents={sessionDetailEvents}
                        autoPlay={true}
                    />
                </div>
            )}

            {/* Replay Selection Table / List */}
            <div className="card overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-text-heading text-sm sm:text-base">Replay Archive</h3>
                        <p className="text-xs text-text-muted">Select an error incident or recorded user session to inspect</p>
                    </div>
                    <button
                        onClick={fetchData}
                        className="btn-outline text-xs px-2.5 py-1.5 flex items-center gap-1.5"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>

                {loading ? (
                    <div className="p-12 text-center">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs text-text-muted">Loading session replays…</p>
                    </div>
                ) : replayEvents.length === 0 && sessions.length === 0 ? (
                    <div className="p-12 text-center">
                        <Laptop size={32} className="mx-auto text-text-muted opacity-40 mb-2" />
                        <p className="text-sm font-semibold text-text-heading">No replays recorded yet</p>
                        <p className="text-xs text-text-muted max-w-sm mx-auto mt-1">
                            Use the Browser SDK in your frontend app or click "Trigger Test Error" above to generate your first causal replay.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {replayEvents.map(evt => {
                            const isSelected = selectedEvent?.id === evt.id;
                            const hasBreadcrumbs = (evt.breadcrumbs?.length || 0) > 0;

                            return (
                                <div
                                    key={evt.id}
                                    onClick={() => handleSelectEvent(evt)}
                                    className={`p-4 flex items-center justify-between gap-4 transition-colors cursor-pointer hover:bg-body/50 ${
                                        isSelected ? 'bg-primary/5 border-l-4 border-primary' : ''
                                    }`}
                                >
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-danger/10 text-danger flex items-center justify-center shrink-0 mt-0.5">
                                            <Bug size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="badge badge-danger text-[10px]">Error</span>
                                                {evt.service && <span className="badge badge-secondary text-[10px]">{evt.service}</span>}
                                                {evt.session_id && (
                                                    <span className="badge badge-info text-[10px] font-mono">
                                                        {evt.session_id}
                                                    </span>
                                                )}
                                                {hasBreadcrumbs && (
                                                    <span className="badge badge-primary text-[10px]">
                                                        {evt.breadcrumbs!.length} Breadcrumbs Captured
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm font-semibold text-text-heading truncate">
                                                {evt.payload || 'Unknown Error'}
                                            </p>
                                            <p className="text-xs text-text-muted mt-0.5">
                                                {format(new Date(evt.timestamp), 'MMM d, yyyy HH:mm:ss')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button className={`btn-primary text-xs px-3 py-1.5 flex items-center gap-1 ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}>
                                            <PlaySquare size={13} />
                                            <span>{isSelected ? 'Replaying' : 'Play Replay'}</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {sessions.map(s => {
                            const isSelected = selectedSession === s.session_id;
                            return (
                                <div
                                    key={s.session_id}
                                    onClick={() => handleSelectSession(s.session_id)}
                                    className={`p-4 flex items-center justify-between gap-4 transition-colors cursor-pointer hover:bg-body/50 ${
                                        isSelected ? 'bg-primary/5 border-l-4 border-primary' : ''
                                    }`}
                                >
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                                            <PlaySquare size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="badge badge-primary text-[10px]">Session</span>
                                                <span className="badge badge-secondary text-[10px]">{s.service}</span>
                                                <span className="text-xs font-mono text-text-muted">{s.session_id}</span>
                                            </div>
                                            <p className="text-sm font-semibold text-text-heading">
                                                {s.event_count} Events recorded ({s.error_count} Errors)
                                            </p>
                                            <p className="text-xs text-text-muted mt-0.5">
                                                Duration: {Math.round(s.duration_ms / 1000)}s • Last active {format(new Date(s.last_seen), 'HH:mm:ss')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1">
                                            <PlaySquare size={13} />
                                            <span>Play Session</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
