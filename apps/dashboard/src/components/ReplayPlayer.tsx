import { useState, useEffect, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import {
    Play, Pause, RotateCcw, SkipBack, SkipForward,
    Flame, MousePointer, Globe, Bug, Terminal, Clock,
    X, Shield, Activity
} from 'lucide-react';
import type { Event } from './Timeline';

interface ReplayPlayerProps {
    event?: Event | null;
    sessionEvents?: Event[];
    onClose?: () => void;
    autoPlay?: boolean;
}

interface ReplayStep {
    id: string;
    timestamp: number;
    relativeMs: number;
    category: 'ui.click' | 'navigation' | 'http' | 'console' | 'error' | 'log' | 'trace';
    title: string;
    description?: string;
    level?: 'info' | 'warning' | 'error';
    data?: Record<string, any>;
    isCrash?: boolean;
    url?: string;
}

export function ReplayPlayer({ event, sessionEvents = [], onClose, autoPlay = true }: ReplayPlayerProps) {
    // 1. Build unified chronological steps from either the event's breadcrumbs or session events
    const { steps, durationMs, crashStepIndex } = useMemo(() => {
        let rawSteps: ReplayStep[] = [];

        // If the event has embedded breadcrumbs, use them
        if (event?.breadcrumbs && event.breadcrumbs.length > 0) {
            const firstTime = event.breadcrumbs[0].timestamp;
            rawSteps = event.breadcrumbs.map((b, idx) => ({
                id: `bc-${idx}`,
                timestamp: b.timestamp,
                relativeMs: Math.max(0, b.timestamp - firstTime),
                category: (b.category as any) || 'ui.click',
                title: b.message || 'User action',
                level: b.level || 'info',
                data: b.data,
                url: b.data?.url || b.data?.path || (typeof window !== 'undefined' ? window.location.pathname : '/'),
            }));

            // Climax error step
            const crashRelMs = Math.max(0, event.timestamp - firstTime);
            rawSteps.push({
                id: `crash-${event.id}`,
                timestamp: event.timestamp,
                relativeMs: Math.max(crashRelMs, rawSteps[rawSteps.length - 1]?.relativeMs + 800 || 1000),
                category: 'error',
                title: event.payload || 'Fatal Exception',
                description: event.exceptions?.[0]?.message || event.payload,
                level: 'error',
                isCrash: true,
                data: {
                    type: event.exceptions?.[0]?.type || 'Error',
                    stack: event.exceptions?.[0]?.stack_trace,
                },
                url: typeof window !== 'undefined' ? window.location.pathname : '/',
            });
        } else if (sessionEvents.length > 0) {
            // Build from multiple session events
            const sorted = [...sessionEvents].sort((a, b) => a.timestamp - b.timestamp);
            const firstTime = sorted[0].timestamp;

            sorted.forEach((e) => {
                if (e.breadcrumbs && e.breadcrumbs.length > 0) {
                    e.breadcrumbs.forEach((b, bIdx) => {
                        rawSteps.push({
                            id: `s-bc-${e.id}-${bIdx}`,
                            timestamp: b.timestamp,
                            relativeMs: Math.max(0, b.timestamp - firstTime),
                            category: (b.category as any) || 'ui.click',
                            title: b.message,
                            level: b.level || 'info',
                            data: b.data,
                            url: b.data?.url || b.data?.path || '/',
                        });
                    });
                }

                rawSteps.push({
                    id: `evt-${e.id}`,
                    timestamp: e.timestamp,
                    relativeMs: Math.max(0, e.timestamp - firstTime),
                    category: e.type === 'error' ? 'error' : e.type === 'trace' ? 'trace' : 'log',
                    title: e.payload || `${e.type} event`,
                    description: e.exceptions?.[0]?.message,
                    level: e.severity === 'error' || e.type === 'error' ? 'error' : 'info',
                    isCrash: e.type === 'error',
                    data: {
                        service: e.service,
                        metadata: e.metadata,
                        stack: e.exceptions?.[0]?.stack_trace,
                    },
                    url: '/',
                });
            });
        } else if (event) {
            // Fallback for single event without breadcrumbs
            const startTime = event.timestamp - 3500;
            rawSteps = [
                {
                    id: 'sim-1',
                    timestamp: startTime,
                    relativeMs: 0,
                    category: 'navigation',
                    title: 'Page loaded: ' + (typeof window !== 'undefined' ? window.location.pathname : '/'),
                    level: 'info',
                    url: '/',
                },
                {
                    id: 'sim-2',
                    timestamp: startTime + 1200,
                    relativeMs: 1200,
                    category: 'ui.click',
                    title: 'User interaction captured',
                    level: 'info',
                    url: '/',
                },
                {
                    id: 'sim-3',
                    timestamp: startTime + 2400,
                    relativeMs: 2400,
                    category: 'http',
                    title: 'HTTP POST /api/v1/action -> 500',
                    level: 'warning',
                    url: '/',
                },
                {
                    id: `crash-${event.id}`,
                    timestamp: event.timestamp,
                    relativeMs: 3500,
                    category: 'error',
                    title: event.payload || 'Fatal Error Encountered',
                    description: event.exceptions?.[0]?.message || event.payload,
                    level: 'error',
                    isCrash: true,
                    data: {
                        stack: event.exceptions?.[0]?.stack_trace,
                    },
                    url: '/',
                },
            ];
        }

        // Ensure chronological sorting
        rawSteps.sort((a, b) => a.relativeMs - b.relativeMs);

        // Normalize time offsets so there are no negative numbers
        const base = rawSteps[0]?.relativeMs || 0;
        rawSteps.forEach(s => { s.relativeMs -= base; });

        const totalDur = Math.max(rawSteps[rawSteps.length - 1]?.relativeMs || 5000, 3000);
        const crashIdx = rawSteps.findIndex(s => s.isCrash);

        return {
            steps: rawSteps,
            durationMs: totalDur,
            crashStepIndex: crashIdx >= 0 ? crashIdx : rawSteps.length - 1,
        };
    }, [event, sessionEvents]);

    // Playback state
    const [currentMs, setCurrentMs] = useState(0);
    const [isPlaying, setIsPlaying] = useState(autoPlay);
    const [speed, setSpeed] = useState<number>(1);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

    const stepListRef = useRef<HTMLDivElement>(null);
    const requestRef = useRef<number | null>(null);
    const lastTickRef = useRef<number>(Date.now());

    // Update active step based on currentMs
    useEffect(() => {
        let activeIdx = 0;
        for (let i = 0; i < steps.length; i++) {
            if (steps[i].relativeMs <= currentMs) {
                activeIdx = i;
            } else {
                break;
            }
        }
        setActiveStepIndex(activeIdx);
    }, [currentMs, steps]);

    // Auto-scroll list when active step changes
    useEffect(() => {
        if (!stepListRef.current) return;
        const activeElem = stepListRef.current.querySelector(`[data-step-index="${activeStepIndex}"]`);
        if (activeElem) {
            activeElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [activeStepIndex]);

    // Playback animation loop
    useEffect(() => {
        if (!isPlaying) {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            return;
        }

        lastTickRef.current = Date.now();

        const tick = () => {
            const now = Date.now();
            const delta = (now - lastTickRef.current) * speed;
            lastTickRef.current = now;

            setCurrentMs(prev => {
                const next = prev + delta;
                if (next >= durationMs) {
                    setIsPlaying(false);
                    return durationMs;
                }
                return next;
            });

            requestRef.current = requestAnimationFrame(tick);
        };

        requestRef.current = requestAnimationFrame(tick);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying, speed, durationMs]);

    // Keyboard shortcuts (Space = Play/Pause, Left/Right = Seek, Escape = Close)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.code === 'Space') {
                e.preventDefault();
                setIsPlaying(p => !p);
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                seekToStep(Math.max(0, activeStepIndex - 1));
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                seekToStep(Math.min(steps.length - 1, activeStepIndex + 1));
            } else if (e.code === 'Escape' && onClose) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeStepIndex, steps.length, onClose]);

    const seekToStep = (index: number) => {
        if (index >= 0 && index < steps.length) {
            setCurrentMs(steps[index].relativeMs);
            setActiveStepIndex(index);
        }
    };

    const jumpToCrash = () => {
        if (crashStepIndex >= 0) {
            seekToStep(crashStepIndex);
            setIsPlaying(false);
        }
    };

    const restart = () => {
        setCurrentMs(0);
        setActiveStepIndex(0);
        setIsPlaying(true);
    };

    const currentStep = steps[activeStepIndex] || steps[0];

    const filteredSteps = useMemo(() => {
        if (filterCategory === 'all') return steps;
        return steps.filter(s => s.category === filterCategory || (filterCategory === 'error' && s.isCrash));
    }, [steps, filterCategory]);

    const formatMs = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        const remainder = Math.floor((ms % 1000) / 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${remainder}`;
    };

    return (
        <div className="bg-surface rounded-xl border border-border shadow-modal flex flex-col overflow-hidden max-w-6xl w-full mx-auto max-h-[90vh]">
            {/* Top Bar Header */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-sidebar/5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
                        <Activity size={18} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-heading text-sm sm:text-base">DevTrace Session Replay</span>
                            <span className="badge badge-primary text-[10px] uppercase font-bold tracking-wider">Causal Timeline</span>
                            {event?.service && <span className="badge badge-secondary text-[10px]">{event.service}</span>}
                        </div>
                        <p className="text-xs text-text-muted">
                            Trace back exact user clicks, route transitions, network requests, and the root cause.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {crashStepIndex >= 0 && (
                        <button
                            onClick={jumpToCrash}
                            className="btn-danger text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-sm"
                            title="Jump directly to the error moment"
                        >
                            <Flame size={14} className="animate-pulse" />
                            <span>Jump to Crash</span>
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 text-text-muted hover:text-text-heading hover:bg-body rounded-lg transition-colors ml-2"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Main Dual-View Body */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-[460px] overflow-hidden">
                {/* Left Panel: Simulated Viewport / Screen State (7 cols) */}
                <div className="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-border bg-body/60 flex flex-col p-4 sm:p-5">
                    {/* Simulated Browser Chrome */}
                    <div className="bg-surface rounded-lg border border-border shadow-sm flex flex-col overflow-hidden flex-1">
                        {/* Browser Window Bar */}
                        <div className="bg-sidebar/10 border-b border-border px-3 py-2 flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-danger/80 inline-block" />
                                <span className="w-2.5 h-2.5 rounded-full bg-warning/80 inline-block" />
                                <span className="w-2.5 h-2.5 rounded-full bg-success/80 inline-block" />
                            </div>

                            {/* Simulated Address Bar */}
                            <div className="flex-1 bg-surface border border-border rounded px-2.5 py-1 text-xs text-text-muted flex items-center gap-1.5 truncate max-w-md mx-auto">
                                <Shield size={11} className="text-success shrink-0" />
                                <span className="text-text-heading font-mono text-[11px] truncate">
                                    {currentStep?.url || 'http://localhost:5173/'}
                                </span>
                            </div>

                            <span className="text-[10px] text-text-muted font-mono font-semibold">
                                {formatMs(currentMs)}
                            </span>
                        </div>

                        {/* Interactive Screen Canvas */}
                        <div className="flex-1 p-6 flex flex-col justify-center items-center relative overflow-hidden bg-gradient-to-b from-body/30 to-body/80 min-h-[280px]">
                            {/* Animated Click Ripple indicator */}
                            {currentStep?.category === 'ui.click' && (
                                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-10 animate-in fade-in zoom-in duration-200">
                                    <div className="relative flex items-center justify-center">
                                        <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary animate-ping absolute" />
                                        <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-primary shadow-lg shadow-primary/40">
                                            <MousePointer size={18} />
                                        </div>
                                    </div>
                                    <span className="mt-2 text-xs font-semibold px-2.5 py-1 bg-surface border border-border rounded-full shadow text-text-heading">
                                        {currentStep.title}
                                    </span>
                                </div>
                            )}

                            {/* Error Crash State */}
                            {currentStep?.isCrash ? (
                                <div className="w-full max-w-md bg-danger/5 border-2 border-danger/40 rounded-xl p-5 shadow-lg animate-in zoom-in-95 duration-200">
                                    <div className="flex items-center gap-2 text-danger font-bold text-sm mb-2">
                                        <Bug size={18} />
                                        <span>CRASH EXCEPTION TRIGGERED</span>
                                    </div>
                                    <p className="text-text-heading font-semibold text-sm mb-1 leading-snug">
                                        {currentStep.description || currentStep.title}
                                    </p>
                                    <p className="text-xs text-text-muted font-mono mb-3">
                                        Timestamp: {format(new Date(currentStep.timestamp), 'HH:mm:ss.SSS')}
                                    </p>
                                    {currentStep.data?.stack && (
                                        <div className="bg-sidebar rounded p-2.5 text-[11px] font-mono text-white/80 overflow-x-auto max-h-32 border border-white/10">
                                            {currentStep.data.stack[0]?.filename}:{currentStep.data.stack[0]?.line} in {currentStep.data.stack[0]?.function}()
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Normal Playback Activity Card */
                                <div className="w-full max-w-sm bg-surface border border-border rounded-xl p-4 shadow-sm text-center">
                                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary mb-3">
                                        {currentStep?.category === 'navigation' ? <Globe size={20} />
                                            : currentStep?.category === 'http' ? <Activity size={20} />
                                            : currentStep?.category === 'ui.click' ? <MousePointer size={20} />
                                            : <Terminal size={20} />}
                                    </div>
                                    <h4 className="text-sm font-semibold text-text-heading capitalize mb-1">
                                        {currentStep?.category?.replace('.', ' ') || 'App Activity'}
                                    </h4>
                                    <p className="text-xs text-text-muted mb-3 font-medium">
                                        {currentStep?.title || 'User navigating application'}
                                    </p>
                                    <div className="flex items-center justify-center gap-2 text-[11px] text-text-muted">
                                        <Clock size={12} />
                                        <span>Step {activeStepIndex + 1} of {steps.length}</span>
                                        <span>•</span>
                                        <span>+{Math.round(currentStep?.relativeMs || 0)}ms</span>
                                    </div>
                                </div>
                            )}

                            {/* Watermark in corner */}
                            <div className="absolute bottom-3 right-4 text-[10px] text-text-muted font-mono opacity-60">
                                DevTrace Replay Engine
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Synchronized Telemetry / Breadcrumb Feed (5 cols) */}
                <div className="lg:col-span-5 flex flex-col bg-surface overflow-hidden">
                    {/* Filter bar */}
                    <div className="p-3 border-b border-border flex items-center justify-between gap-1 bg-body/20">
                        <span className="text-xs font-semibold text-text-heading px-1">Events & Breadcrumbs</span>
                        <div className="flex items-center gap-1">
                            {['all', 'ui.click', 'http', 'navigation', 'error'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setFilterCategory(cat)}
                                    className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                                        filterCategory === cat
                                            ? 'bg-primary text-white'
                                            : 'text-text-muted hover:bg-body'
                                    }`}
                                >
                                    {cat === 'all' ? 'All' : cat === 'ui.click' ? 'Clicks' : cat === 'http' ? 'Network' : cat === 'navigation' ? 'Nav' : 'Errors'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scrollable list */}
                    <div ref={stepListRef} className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[380px]">
                        {filteredSteps.map((step, idx) => {
                            const originalIndex = steps.indexOf(step);
                            const isActive = originalIndex === activeStepIndex;
                            const isPast = originalIndex < activeStepIndex;

                            let badgeColor = 'badge-primary';
                            let icon = <MousePointer size={12} />;
                            if (step.category === 'navigation') {
                                badgeColor = 'badge-info';
                                icon = <Globe size={12} />;
                            } else if (step.category === 'http') {
                                badgeColor = step.level === 'error' ? 'badge-danger' : 'badge-success';
                                icon = <Activity size={12} />;
                            } else if (step.category === 'error' || step.isCrash) {
                                badgeColor = 'badge-danger';
                                icon = <Bug size={12} />;
                            } else if (step.category === 'console') {
                                badgeColor = 'badge-secondary';
                                icon = <Terminal size={12} />;
                            }

                            return (
                                <div
                                    key={step.id || idx}
                                    data-step-index={originalIndex}
                                    onClick={() => seekToStep(originalIndex)}
                                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer relative ${
                                        isActive
                                            ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary'
                                            : isPast
                                            ? 'bg-body/40 border-border opacity-85 hover:opacity-100 hover:border-primary/40'
                                            : 'bg-surface border-border/60 opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    {isActive && (
                                        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-primary rounded-r" />
                                    )}

                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`badge ${badgeColor} text-[10px] py-0 px-1.5 flex items-center gap-1`}>
                                                {icon}
                                                <span className="capitalize">{step.category.replace('.', ' ')}</span>
                                            </span>
                                            {step.isCrash && (
                                                <span className="badge badge-danger text-[9px] uppercase font-bold animate-pulse">
                                                    Crash
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-mono text-text-muted">
                                            +{Math.round(step.relativeMs)}ms
                                        </span>
                                    </div>

                                    <p className={`text-xs font-medium leading-snug line-clamp-2 ${isActive ? 'text-primary font-semibold' : 'text-text-heading'}`}>
                                        {step.title}
                                    </p>

                                    {step.data && (step.data.status || step.data.durationMs) && (
                                        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted font-mono">
                                            {step.data.status && <span>Status: {step.data.status}</span>}
                                            {step.data.durationMs && <span>Duration: {step.data.durationMs}ms</span>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Bottom Scrubber & Playback Controls Bar */}
            <div className="bg-surface border-t border-border p-4 flex flex-col gap-2.5">
                {/* Timeline Progress Bar with Step Markers */}
                <div className="relative w-full py-1">
                    <input
                        type="range"
                        min="0"
                        max={durationMs}
                        value={currentMs}
                        onChange={e => setCurrentMs(Number(e.target.value))}
                        className="w-full h-2 bg-body rounded-lg appearance-none cursor-pointer accent-primary relative z-10"
                    />

                    {/* Step Tick Markers along the bar */}
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center pointer-events-none px-1">
                        {steps.map(step => {
                            const leftPercent = (step.relativeMs / Math.max(durationMs, 1)) * 100;
                            const isCrash = step.isCrash || step.category === 'error';
                            return (
                                <div
                                    key={step.id}
                                    style={{ left: `${leftPercent}%` }}
                                    className={`absolute w-2 h-2 rounded-full -translate-x-1/2 transition-transform ${
                                        isCrash
                                            ? 'bg-danger ring-2 ring-danger/40 scale-125 z-20'
                                            : step.category === 'http'
                                            ? 'bg-success scale-90'
                                            : step.category === 'navigation'
                                            ? 'bg-info scale-90'
                                            : 'bg-primary/80 scale-75'
                                    }`}
                                    title={step.title}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Control Buttons & Speed */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                    {/* Left: Playback buttons */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={restart}
                            className="p-1.5 text-text-muted hover:text-text-heading hover:bg-body rounded-lg transition-colors"
                            title="Restart replay"
                        >
                            <RotateCcw size={15} />
                        </button>
                        <button
                            onClick={() => seekToStep(Math.max(0, activeStepIndex - 1))}
                            className="p-1.5 text-text-muted hover:text-text-heading hover:bg-body rounded-lg transition-colors"
                            title="Previous step (Left Arrow)"
                        >
                            <SkipBack size={15} />
                        </button>
                        <button
                            onClick={() => setIsPlaying(p => !p)}
                            className="w-8 h-8 rounded-lg bg-primary hover:bg-primary-hover text-white flex items-center justify-center shadow-md shadow-primary/30 transition-all"
                            title="Play/Pause (Space)"
                        >
                            {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
                        </button>
                        <button
                            onClick={() => seekToStep(Math.min(steps.length - 1, activeStepIndex + 1))}
                            className="p-1.5 text-text-muted hover:text-text-heading hover:bg-body rounded-lg transition-colors"
                            title="Next step (Right Arrow)"
                        >
                            <SkipForward size={15} />
                        </button>

                        <div className="h-4 w-px bg-border mx-2" />

                        {/* Speed pills */}
                        <div className="flex items-center bg-body p-0.5 rounded-lg border border-border text-[11px] font-semibold text-text-muted">
                            {[0.5, 1, 2, 5].map(spd => (
                                <button
                                    key={spd}
                                    onClick={() => setSpeed(spd)}
                                    className={`px-2 py-0.5 rounded transition-colors ${
                                        speed === spd ? 'bg-surface text-primary shadow-xs font-bold' : 'hover:text-text-heading'
                                    }`}
                                >
                                    {spd}x
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Time stamp & shortcuts hint */}
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                        <span className="font-mono text-text-heading font-semibold">
                            {formatMs(currentMs)} <span className="text-text-muted font-normal">/ {formatMs(durationMs)}</span>
                        </span>
                        <span className="hidden sm:inline-block text-[11px] text-text-muted/70">
                            Space: Play/Pause • Arrows: Step
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
