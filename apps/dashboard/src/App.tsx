import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Timeline } from './components/Timeline';
import { SettingsPage } from './components/SettingsPage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { TracingPage } from './components/TracingPage';
import { IncidentsPage } from './components/IncidentsPage';
import type { Event } from './components/Timeline';
import {
    Activity, LayoutDashboard, Settings, Bell, Search,
    AlertTriangle, ChevronRight, Zap, Bug, Info, Menu, X,
    GitBranch,
} from 'lucide-react';
import './App.css';

// On desktop (≥1024px) start open; on mobile start closed
function getDefaultSidebarState() {
    return window.innerWidth >= 1024;
}

function App() {
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'error' | 'log' | 'trace'>('all');
    const [activeNav, setActiveNav] = useState<'events' | 'incidents' | 'analytics' | 'traces' | 'settings'>('events');
    const [sidebarOpen, setSidebarOpen] = useState(getDefaultSidebarState);

    // On mobile clicking a nav item should auto-close the sidebar
    const isMobile = () => window.innerWidth < 1024;

    const handleNavClick = useCallback((nav: 'events' | 'incidents' | 'analytics' | 'traces' | 'settings') => {
        setActiveNav(nav);
        if (isMobile()) setSidebarOpen(false);
    }, []);

    // Close sidebar on resize to mobile
    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth < 1024) setSidebarOpen(false);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const response = await axios.get('http://localhost:4310/api/v1/events');
                setEvents(response.data || []);
                setError(null);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch events');
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
        const interval = setInterval(fetchEvents, 5000);
        return () => clearInterval(interval);
    }, []);

    const filteredEvents = events.filter(e => {
        const matchesSearch =
            !search ||
            e.payload?.toLowerCase().includes(search.toLowerCase()) ||
            e.service?.toLowerCase().includes(search.toLowerCase()) ||
            e.severity?.toLowerCase().includes(search.toLowerCase()) ||
            e.type?.toLowerCase().includes(search.toLowerCase());
        const matchesFilter =
            activeFilter === 'all' ||
            e.type === activeFilter ||
            (activeFilter === 'error' && (e.severity === 'error' || e.severity === 'critical'));
        return matchesSearch && matchesFilter;
    });

    const counts = {
        all:   events.length,
        error: events.filter(e => e.type === 'error' || e.severity === 'error' || e.severity === 'critical').length,
        log:   events.filter(e => e.type === 'log').length,
        trace: events.filter(e => e.type === 'trace').length,
    };

    const filterBtns: { key: typeof activeFilter; label: string; icon: React.ReactNode; color: string }[] = [
        { key: 'all',   label: 'All',    icon: <Zap size={13} />,      color: 'text-primary bg-primary-light border-primary/20' },
        { key: 'error', label: 'Errors', icon: <Bug size={13} />,       color: 'text-danger bg-danger-light border-danger/20' },
        { key: 'log',   label: 'Logs',   icon: <Info size={13} />,      color: 'text-info bg-info-light border-info/20' },
        { key: 'trace', label: 'Traces', icon: <Activity size={13} />,  color: 'text-success bg-success-light border-success/20' },
    ];

    return (
        <div className="min-h-screen bg-body flex overflow-x-hidden">

            {/* ── Mobile backdrop ──────────────────────────── */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* ── Sidebar ──────────────────────────────────── */}
            <aside className={`
                bg-sidebar flex flex-col fixed inset-y-0 left-0 z-40
                transition-transform duration-300 ease-in-out
                w-[260px]
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:translate-x-0
                ${sidebarOpen ? 'lg:w-[260px]' : 'lg:w-[64px] lg:translate-x-0'}
            `}>
                {/* Logo */}
                <div className={`flex items-center border-b border-white/5 py-5 shrink-0 transition-all duration-300
                    ${sidebarOpen ? 'px-6 gap-3' : 'lg:px-0 lg:justify-center px-6 gap-3'}
                `}>
                    <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
                        <Activity size={20} className="text-white" />
                    </div>
                    <div className={`overflow-hidden transition-all duration-300 ${!sidebarOpen ? 'lg:hidden' : ''}`}>
                        <span className="text-white font-bold text-base tracking-tight whitespace-nowrap">DevTrace</span>
                        <p className="text-sidebar-text text-[10px] leading-none mt-0.5 whitespace-nowrap">Observability Platform</p>
                    </div>
                </div>

                {/* Nav */}
                <nav className={`flex-1 overflow-y-auto py-4 space-y-1 transition-all duration-300
                    ${sidebarOpen ? 'px-4' : 'lg:px-2 px-4'}
                `}>
                    {sidebarOpen && (
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20 px-4 mb-3 lg:block hidden">Main</p>
                    )}
                    <p className={`text-[10px] font-semibold uppercase tracking-widest text-white/20 px-4 mb-3 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>Main</p>

                    {/* Events */}
                    <button
                        title="Events"
                        onClick={() => handleNavClick('events')}
                        className={`sidebar-nav-item w-full relative
                            ${activeNav === 'events' ? 'active' : ''}
                            ${!sidebarOpen ? 'lg:justify-center lg:px-2' : ''}
                        `}
                    >
                        <LayoutDashboard size={18} className="shrink-0" />
                        <span className={!sidebarOpen ? 'lg:hidden' : ''}>Events</span>
                    </button>

                    {/* Incidents */}
                    <button
                        title="Incidents"
                        onClick={() => handleNavClick('incidents')}
                        className={`sidebar-nav-item w-full relative
                            ${activeNav === 'incidents' ? 'active' : ''}
                            ${!sidebarOpen ? 'lg:justify-center lg:px-2' : ''}
                        `}
                    >
                        <AlertTriangle size={18} className="shrink-0" />
                        <span className={!sidebarOpen ? 'lg:hidden' : ''}>Incidents</span>
                    </button>

                    {/* Analytics */}
                    <button
                        title="Analytics"
                        onClick={() => handleNavClick('analytics')}
                        className={`sidebar-nav-item w-full
                            ${activeNav === 'analytics' ? 'active' : ''}
                            ${!sidebarOpen ? 'lg:justify-center lg:px-2' : ''}
                        `}
                    >
                        <Activity size={18} className="shrink-0" />
                        <span className={!sidebarOpen ? 'lg:hidden' : ''}>Analytics</span>
                    </button>

                    {/* Traces */}
                    <button
                        title="Traces"
                        onClick={() => handleNavClick('traces')}
                        className={`sidebar-nav-item w-full
                            ${activeNav === 'traces' ? 'active' : ''}
                            ${!sidebarOpen ? 'lg:justify-center lg:px-2' : ''}
                        `}
                    >
                        <GitBranch size={18} className="shrink-0" />
                        <span className={!sidebarOpen ? 'lg:hidden' : ''}>Traces</span>
                    </button>

                    {/* Settings */}
                    <button
                        title="Settings"
                        onClick={() => handleNavClick('settings')}
                        className={`sidebar-nav-item w-full
                            ${activeNav === 'settings' ? 'active' : ''}
                            ${!sidebarOpen ? 'lg:justify-center lg:px-2' : ''}
                        `}
                    >
                        <Settings size={18} className="shrink-0" />
                        <span className={!sidebarOpen ? 'lg:hidden' : ''}>Settings</span>
                    </button>
                </nav>

                {/* User footer */}
                <div className={`py-4 border-t border-white/5 shrink-0 transition-all duration-300
                    ${sidebarOpen ? 'px-4' : 'lg:px-2 px-4'}
                `}>
                    <div className={`flex items-center ${sidebarOpen ? 'gap-3 px-2' : 'lg:justify-center px-2 gap-3'}`}>
                        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            U
                        </div>
                        <div className={`min-w-0 transition-all duration-300 ${!sidebarOpen ? 'lg:hidden' : ''}`}>
                            <p className="text-sidebar-text-active text-sm font-medium truncate">Admin</p>
                            <p className="text-sidebar-text text-xs truncate">admin@devtrace.dev</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* ── Main area ────────────────────────────────── */}
            <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300
                ${sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-[64px]'}
                ml-0
            `}>
                {/* Topbar */}
                <header className="bg-surface border-b border-border sticky top-0 z-20 px-4 h-16 flex items-center gap-3">
                    {/* Sidebar toggle */}
                    <button
                        onClick={() => setSidebarOpen(s => !s)}
                        className="p-2 text-text-muted hover:text-text-heading hover:bg-body rounded-lg transition-colors shrink-0"
                        title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                    >
                        <Menu size={18} />
                    </button>

                    {/* Search — hidden on very small screens, shown from sm up */}
                    <div className="hidden sm:block flex-1 max-w-sm relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={15} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search events…"
                            className="form-input pl-9 h-9 text-sm"
                        />
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        {/* Bell */}
                        <button className="relative p-2 text-text-muted hover:text-text-heading hover:bg-body rounded-lg transition-colors">
                            <Bell size={18} />
                            {counts.error > 0 && (
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border-2 border-surface" />
                            )}
                        </button>

                        {/* Test error — hidden on xs */}
                        <button
                            onClick={() => {
                                throw new Error('This is a frontend test error caught by the DevTrace Browser SDK!');
                            }}
                            className="btn-primary text-xs hidden sm:block"
                        >
                            Trigger Test Error
                        </button>
                    </div>
                </header>

                {/* Mobile search bar (shown below topbar on xs) */}
                <div className="sm:hidden bg-surface border-b border-border px-4 py-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={15} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search events…"
                            className="form-input pl-9 h-9 text-sm w-full"
                        />
                    </div>
                </div>

                {/* Page content */}
                <main className="flex-1 p-4 sm:p-6 lg:p-8">
                    {/* Dynamic Page Header */}
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg sm:text-xl font-semibold text-text-heading capitalize">
                                {activeNav === 'events' ? 'Event Timeline' : activeNav === 'incidents' ? 'Incidents' : activeNav === 'analytics' ? 'Analytics' : activeNav === 'traces' ? 'Distributed Traces' : 'Settings'}
                            </h2>
                            <p className="text-xs sm:text-sm text-text-muted mt-0.5 hidden sm:flex items-center gap-1">
                                <ChevronRight size={12} />
                                {activeNav === 'events' ? 'Monitor traces, logs, and errors in real-time'
                                 : activeNav === 'incidents' ? 'Grouped errors and meaningful failures'
                                 : activeNav === 'analytics' ? 'System performance and event trends'
                                 : activeNav === 'traces' ? 'Request waterfalls and span visualization'
                                 : 'Configure your DevTrace workspace'}
                            </p>
                        </div>
                        {/* Live badge */}
                        <div className="flex items-center gap-2 text-xs font-medium text-success bg-success-light border border-success/20 px-2.5 py-1.5 rounded-full shrink-0">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                            </span>
                            <span className="hidden sm:inline">Live Updates</span>
                            <span className="sm:hidden">Live</span>
                        </div>
                    </div>

                    {/* Filter / stat cards (Only for Events page) */}
                    {activeNav === 'events' && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                            {filterBtns.map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setActiveFilter(f.key)}
                                    className={`card p-3 sm:p-4 text-left transition-all hover:shadow-md ${activeFilter === f.key ? 'ring-2 ring-primary' : ''}`}
                                >
                                    <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${f.color} mb-2`}>
                                        {f.icon}
                                        <span>{f.label}</span>
                                    </div>
                                    <p className="text-xl sm:text-2xl font-bold text-text-heading">{counts[f.key]}</p>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Connection error */}
                    {error && (
                        <div className="card p-3 sm:p-4 mb-5 flex items-center gap-3" style={{ borderColor: 'rgba(234,84,85,0.3)', backgroundColor: '#FCEAEA' }}>
                            <AlertTriangle size={18} className="text-danger shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-danger">Connection Error</p>
                                <p className="text-xs text-danger opacity-80 truncate">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Timeline, Analytics, Traces, or Settings */}
                    {activeNav === 'events' ? (
                        loading ? (
                            <div className="flex items-center justify-center py-24">
                                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            </div>
                        ) : (
                            <Timeline events={filteredEvents} allEventsCount={events.length} />
                        )
                    ) : activeNav === 'incidents' ? (
                        <IncidentsPage />
                    ) : activeNav === 'analytics' ? (
                        <AnalyticsPage />
                    ) : activeNav === 'traces' ? (
                        <TracingPage events={events} />
                    ) : (
                        <SettingsPage />
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
