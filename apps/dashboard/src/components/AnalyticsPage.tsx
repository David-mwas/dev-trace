import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    TrendingUp, TrendingDown, Minus, AlertCircle,
    Bug, Info, Activity, Zap, Loader2
} from 'lucide-react';

const COLLECTOR = 'http://localhost:4310';

interface HourlyPoint { hour: string; errors: number; logs: number; traces: number; }
interface ServiceCount { service: string; count: number; }
interface HeatCell { hour: number; count: number; }
interface TrendStat { total: number; current: number; previous: number; delta: number; }
interface Analytics {
    hourly: HourlyPoint[];
    services: ServiceCount[];
    heatmap: HeatCell[];
    trends: Record<string, TrendStat>;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
    label, value, delta, icon, color
}: { label: string; value: number; delta: number; icon: React.ReactNode; color: string }) {
    const isUp = delta > 0;
    const isDown = delta < 0;
    return (
        <div className="card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                    {icon}
                </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-text-heading mb-1">{value.toLocaleString()}</p>
            <div className="flex items-center gap-1 text-xs font-medium">
                {isUp && <><TrendingUp size={12} className="text-success" /><span className="text-success">+{delta.toFixed(1)}%</span></>}
                {isDown && <><TrendingDown size={12} className="text-danger" /><span className="text-danger">{delta.toFixed(1)}%</span></>}
                {!isUp && !isDown && <><Minus size={12} className="text-text-muted" /><span className="text-text-muted">0%</span></>}
                <span className="text-text-muted ml-1">vs last hour</span>
            </div>
        </div>
    );
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function HeatmapGrid({ data }: { data: HeatCell[] }) {
    const max = Math.max(...data.map(d => d.count), 1);
    const getColor = (count: number) => {
        if (count === 0) return 'bg-border opacity-40';
        const intensity = count / max;
        if (intensity < 0.25) return 'bg-primary opacity-30';
        if (intensity < 0.5) return 'bg-primary opacity-50';
        if (intensity < 0.75) return 'bg-primary opacity-70';
        return 'bg-primary';
    };

    return (
        <div>
            <div className="grid grid-cols-12 gap-1.5 mb-2">
                {data.slice(0, 12).map(cell => (
                    <div key={cell.hour} className="aspect-square" title={`${String(cell.hour).padStart(2, '0')}:00 — ${cell.count} events`}>
                        <div className={`w-full h-full rounded-sm ${getColor(cell.count)}`} />
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-12 gap-1.5">
                {data.slice(12).map(cell => (
                    <div key={cell.hour} className="aspect-square" title={`${String(cell.hour).padStart(2, '0')}:00 — ${cell.count} events`}>
                        <div className={`w-full h-full rounded-sm ${getColor(cell.count)}`} />
                    </div>
                ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-text-muted font-mono">
                {[0, 3, 6, 9, 12, 15, 18, 21, 23].map(h => (
                    <span key={h}>{String(h).padStart(2, '0')}h</span>
                ))}
            </div>
        </div>
    );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-sidebar border border-white/10 rounded-lg px-3 py-2 shadow-xl text-xs">
            <p className="text-sidebar-text font-semibold mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ color: p.color }} className="font-medium">
                    {p.name}: {p.value}
                </p>
            ))}
        </div>
    );
}

// ─── Analytics Page ───────────────────────────────────────────────────────────

export function AnalyticsPage() {
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetch_ = async () => {
            try {
                const res = await axios.get(`${COLLECTOR}/api/v1/analytics`);
                setData(res.data);
                setError(null);
            } catch (e: any) {
                setError(e.message || 'Failed to load analytics');
            } finally {
                setLoading(false);
            }
        };
        fetch_();
        const iv = setInterval(fetch_, 15000);
        return () => clearInterval(iv);
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center py-32">
            <Loader2 size={28} className="text-primary animate-spin" />
        </div>
    );

    if (error) return (
        <div className="card p-4 flex items-center gap-3" style={{ borderColor: 'rgba(234,84,85,0.3)', backgroundColor: '#FCEAEA' }}>
            <AlertCircle size={18} className="text-danger shrink-0" />
            <p className="text-sm text-danger">{error}</p>
        </div>
    );

    const t = data?.trends || {};

    return (
        <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Events"  value={t.all?.total   ?? 0} delta={t.all?.delta   ?? 0} icon={<Zap     size={16} className="text-primary" />} color="bg-primary-light" />
                <StatCard label="Errors"        value={t.error?.total ?? 0} delta={t.error?.delta ?? 0} icon={<Bug     size={16} className="text-danger"  />} color="bg-danger-light"  />
                <StatCard label="Logs"          value={t.log?.total   ?? 0} delta={t.log?.delta   ?? 0} icon={<Info    size={16} className="text-info"    />} color="bg-info-light"    />
                <StatCard label="Traces"        value={t.trace?.total ?? 0} delta={t.trace?.delta ?? 0} icon={<Activity size={16} className="text-success" />} color="bg-success-light" />
            </div>

            {/* Line chart + heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Line: events over 24h */}
                <div className="card p-5 lg:col-span-2">
                    <h3 className="font-semibold text-text-heading text-sm mb-4">Event Rate — Last 24 Hours</h3>
                    {(data?.hourly?.length ?? 0) === 0 ? (
                        <p className="text-sm text-text-muted text-center py-12">No data yet — fire some events!</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={data?.hourly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#DBDADE" />
                                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#A8AAAE' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#A8AAAE' }} />
                                <Tooltip content={<ChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Line type="monotone" dataKey="errors" stroke="#EA5455" strokeWidth={2} dot={false} name="Errors" />
                                <Line type="monotone" dataKey="logs"   stroke="#00CFE8" strokeWidth={2} dot={false} name="Logs" />
                                <Line type="monotone" dataKey="traces" stroke="#28C76F" strokeWidth={2} dot={false} name="Traces" />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Heatmap: volume by hour */}
                <div className="card p-5">
                    <h3 className="font-semibold text-text-heading text-sm mb-4">Volume by Hour of Day</h3>
                    <HeatmapGrid data={data?.heatmap ?? []} />
                    <div className="flex items-center gap-2 mt-4 text-[11px] text-text-muted">
                        <div className="flex gap-1 items-center">
                            <div className="w-3 h-3 rounded-sm bg-border opacity-40" /> Low
                        </div>
                        <div className="flex gap-1 items-center">
                            <div className="w-3 h-3 rounded-sm bg-primary opacity-50" /> Med
                        </div>
                        <div className="flex gap-1 items-center">
                            <div className="w-3 h-3 rounded-sm bg-primary" /> High
                        </div>
                    </div>
                </div>
            </div>

            {/* Bar chart: events by service */}
            <div className="card p-5">
                <h3 className="font-semibold text-text-heading text-sm mb-4">Events by Service</h3>
                {(data?.services?.length ?? 0) === 0 ? (
                    <p className="text-sm text-text-muted text-center py-12">No service data yet — set a <code className="font-mono text-xs bg-body px-1 rounded">service</code> field in your SDK config.</p>
                ) : (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={data?.services} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#DBDADE" />
                            <XAxis dataKey="service" tick={{ fontSize: 11, fill: '#A8AAAE' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#A8AAAE' }} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="count" fill="#7367F0" radius={[4, 4, 0, 0]} name="Events" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
