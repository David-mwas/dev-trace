import { useState, useEffect } from 'react';
import { AlertCircle, Clock, Loader2, CheckCircle2, ChevronRight, Bug } from 'lucide-react';

const COLLECTOR = 'http://localhost:4310';

export interface Incident {
    id: string;
    project_id: string;
    title: string;
    severity: string;
    status: string;
    root_event_id: string;
    created_at: number;
    resolved_at?: number;
}

export function IncidentsPage() {
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchIncidents = async () => {
            try {
                const res = await fetch(`${COLLECTOR}/api/v1/incidents`);
                if (!res.ok) throw new Error('Failed to fetch incidents');
                const data = await res.json();
                setIncidents(data);
                setError(null);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchIncidents();
        const interval = setInterval(fetchIncidents, 5000);
        return () => clearInterval(interval);
    }, []);

    const updateStatus = async (id: string, newStatus: string) => {
        try {
            await fetch(`${COLLECTOR}/api/v1/incidents/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            setIncidents(incidents.map(i => i.id === id ? { ...i, status: newStatus } : i));
        } catch (e) {
            console.error('Failed to update incident', e);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="text-primary animate-spin" />
        </div>
    );

    if (error) return (
        <div className="card p-4 flex items-center gap-3" style={{ borderColor: 'rgba(234,84,85,0.3)', backgroundColor: '#FCEAEA' }}>
            <AlertCircle size={18} className="text-danger shrink-0" />
            <p className="text-sm text-danger">{error}</p>
        </div>
    );

    if (incidents.length === 0) return (
        <div className="card py-16 px-6 text-center">
            <CheckCircle2 size={44} className="mx-auto mb-3 text-success opacity-50" />
            <h3 className="text-lg font-semibold text-text-heading mb-1">Zero Open Incidents</h3>
            <p className="text-sm text-text-muted">Your systems are healthy and error-free.</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {incidents.map(inc => (
                <div key={inc.id} className="card p-0 overflow-hidden hover:shadow-md transition-shadow group cursor-pointer border-l-4" style={{ borderLeftColor: inc.status === 'RESOLVED' ? '#28C76F' : '#EA5455' }}>
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${inc.status === 'OPEN' ? 'bg-danger-light text-danger' : inc.status === 'RESOLVED' ? 'bg-success-light text-success' : 'bg-warning-light text-warning'}`}>
                                    {inc.status}
                                </span>
                                <span className="text-xs font-mono text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
                                    {inc.id.substring(0, 12)}
                                </span>
                                <span className="text-xs font-medium text-text-muted px-2 py-0.5 rounded-full border border-border bg-surface">
                                    {inc.project_id}
                                </span>
                            </div>
                            
                            <h3 className="text-base sm:text-lg font-semibold text-text-heading truncate flex items-center gap-2">
                                <Bug size={16} className="text-danger opacity-70 shrink-0" />
                                {inc.title}
                            </h3>
                            
                            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-text-muted">
                                <div className="flex items-center gap-1">
                                    <Clock size={13} />
                                    First seen: {new Date(inc.created_at).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            <select
                                value={inc.status}
                                onChange={(e) => updateStatus(inc.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="form-input text-xs h-8 pr-8 w-32"
                            >
                                <option value="OPEN">OPEN</option>
                                <option value="INVESTIGATING">INVESTIGATING</option>
                                <option value="RESOLVED">RESOLVED</option>
                            </select>
                            
                            <button className="btn-secondary h-8 w-8 !p-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight size={16} />
                            </button>
                        </div>

                    </div>
                </div>
            ))}
        </div>
    );
}
