import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    FolderOpen, Plus, Trash2, Copy, Check, ChevronRight,
    Terminal, AlertCircle, Loader2, X
} from 'lucide-react';

interface Project {
    id: string;
    name: string;
    path: string;
    created_at: number;
}

const COLLECTOR_URL = 'http://localhost:4310';

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={copy} className="p-1.5 rounded hover:bg-white/10 transition-colors text-sidebar-text" title="Copy">
            {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>
    );
}

function CodeBlock({ code, lang = 'ts' }: { code: string; lang?: string }) {
    return (
        <div className="relative bg-[#1E222A] rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#282C34] border-b border-white/5">
                <span className="text-[10px] font-mono text-[#5C6370] uppercase tracking-wider">{lang}</span>
                <CopyButton text={code} />
            </div>
            <pre className="p-4 text-xs font-mono text-[#ABB2BF] overflow-x-auto leading-relaxed whitespace-pre">{code}</pre>
        </div>
    );
}

export function SettingsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);

    // New project form
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ name: '', path: '/' });
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchProjects = async () => {
        try {
            const res = await axios.get(`${COLLECTOR_URL}/api/v1/projects`);
            setProjects(res.data || []);
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Failed to fetch projects');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProjects(); }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) { setFormError('Project name is required'); return; }
        setFormError(null);
        setSubmitting(true);
        try {
            const id = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const newProject = { id, name: form.name.trim(), path: form.path.trim() || '/' };
            const res = await axios.post(`${COLLECTOR_URL}/api/v1/projects`, newProject);
            setProjects(p => [res.data, ...p]);
            setForm({ name: '', path: '/' });
            setCreating(false);
            setSelectedProject(res.data);
        } catch (e: any) {
            setFormError(e.response?.data || e.message || 'Failed to create project');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this project? This will not delete its events.')) return;
        setDeletingId(id);
        try {
            await axios.delete(`${COLLECTOR_URL}/api/v1/projects/${id}`);
            setProjects(p => p.filter(pr => pr.id !== id));
            if (selectedProject?.id === id) setSelectedProject(null);
        } catch (e: any) {
            alert('Failed to delete: ' + (e.message || 'Unknown error'));
        } finally {
            setDeletingId(null);
        }
    };

    const nodeSnippet = (p: Project) => `import { DevTrace } from '@devtrace/node-sdk';

const devtrace = new DevTrace({
  projectId: '${p.id}',
  collectorUrl: '${COLLECTOR_URL}',
  service: 'your-service-name',
  environment: process.env.NODE_ENV,
});

// Capture an error
try {
  // ... your code
} catch (err) {
  await devtrace.captureError(err);
}`;

    const browserSnippet = (p: Project) => `import { DevTraceBrowser } from '@devtrace/browser-sdk';
import { ErrorBoundary } from '@devtrace/browser-sdk/react';

const devtrace = new DevTraceBrowser({
  projectId: '${p.id}',
  collectorUrl: '${COLLECTOR_URL}',
  service: 'your-frontend-app',
  captureConsoleErrors: true,
});

devtrace.init(); // attach global error listeners

// Wrap your React app:
<ErrorBoundary devtrace={devtrace} fallback={<p>Something went wrong</p>}>
  <App />
</ErrorBoundary>`;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Left: Project list ─────────────────────── */}
            <div className="lg:col-span-1 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-text-heading">Projects</h3>
                    <button
                        onClick={() => { setCreating(true); setSelectedProject(null); }}
                        className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3"
                    >
                        <Plus size={13} /> New Project
                    </button>
                </div>

                {/* Error state */}
                {error && (
                    <div className="card p-3 flex items-center gap-2" style={{ borderColor: 'rgba(234,84,85,0.3)', backgroundColor: '#FCEAEA' }}>
                        <AlertCircle size={16} className="text-danger shrink-0" />
                        <p className="text-xs text-danger">{error}</p>
                    </div>
                )}

                {/* Loading */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={22} className="text-primary animate-spin" />
                    </div>
                ) : projects.length === 0 ? (
                    <div className="card p-6 text-center">
                        <FolderOpen size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm font-medium text-text-heading">No projects yet</p>
                        <p className="text-xs text-text-muted mt-1">Create your first project to start capturing events.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {projects.map(p => (
                            <div
                                key={p.id}
                                className={`card p-3.5 cursor-pointer flex items-center gap-3 group transition-all hover:shadow-md ${
                                    selectedProject?.id === p.id ? 'ring-2 ring-primary' : ''
                                }`}
                                onClick={() => { setSelectedProject(p); setCreating(false); }}
                            >
                                <div className="w-8 h-8 rounded-md bg-primary-light flex items-center justify-center shrink-0">
                                    <FolderOpen size={15} className="text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-text-heading truncate">{p.name}</p>
                                    <p className="text-[11px] text-text-muted font-mono truncate">{p.id}</p>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                                        className="p-1.5 rounded hover:bg-danger-light text-text-muted hover:text-danger transition-colors"
                                        disabled={deletingId === p.id}
                                    >
                                        {deletingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                    </button>
                                    <ChevronRight size={14} className="text-border" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Right: Create form / Connection guide ─── */}
            <div className="lg:col-span-2">
                {/* Create form */}
                {creating && (
                    <div className="card p-5 mb-4">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-semibold text-text-heading">New Project</h4>
                            <button onClick={() => setCreating(false)} className="text-text-muted hover:text-text-heading p-1 rounded transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Project Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. My API Service"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    className="form-input"
                                    autoFocus
                                />
                                <p className="text-[11px] text-text-muted mt-1">
                                    ID will be auto-generated as: <code className="font-mono bg-body px-1 rounded">{form.name ? form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'your-project-id'}</code>
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Path / Scope</label>
                                <input
                                    type="text"
                                    placeholder="e.g. /api or /frontend"
                                    value={form.path}
                                    onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                                    className="form-input"
                                />
                            </div>
                            {formError && (
                                <p className="text-xs text-danger flex items-center gap-1.5">
                                    <AlertCircle size={12} /> {formError}
                                </p>
                            )}
                            <div className="flex gap-3 pt-1">
                                <button type="submit" disabled={submitting} className="btn-primary flex items-center gap-1.5">
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                    Create Project
                                </button>
                                <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-text-muted hover:text-text-heading transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Connection guide */}
                {selectedProject && !creating && (
                    <div className="space-y-4">
                        <div className="card p-5">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center">
                                    <FolderOpen size={18} className="text-primary" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-text-heading">{selectedProject.name}</h4>
                                    <p className="text-xs text-text-muted font-mono">{selectedProject.id}</p>
                                </div>
                            </div>

                            {/* Quick config */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-body rounded-md p-3 border border-border">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Project ID</p>
                                    <div className="flex items-center gap-1 font-mono text-xs text-text-heading">
                                        <span className="truncate">{selectedProject.id}</span>
                                        <CopyButton text={selectedProject.id} />
                                    </div>
                                </div>
                                <div className="bg-body rounded-md p-3 border border-border">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Collector URL</p>
                                    <div className="flex items-center gap-1 font-mono text-xs text-text-heading">
                                        <span className="truncate">{COLLECTOR_URL}</span>
                                        <CopyButton text={COLLECTOR_URL} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Node SDK */}
                        <div className="card overflow-hidden">
                            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                                <Terminal size={15} className="text-primary" />
                                <h5 className="font-semibold text-sm text-text-heading">Node.js SDK</h5>
                                <span className="ml-auto badge badge-secondary">@devtrace/node-sdk</span>
                            </div>
                            <div className="p-5">
                                <p className="text-xs text-text-muted mb-3">Install and use in your Node.js backend:</p>
                                <CodeBlock code={`npm install @devtrace/node-sdk`} lang="bash" />
                                <div className="mt-3">
                                    <CodeBlock code={nodeSnippet(selectedProject)} lang="typescript" />
                                </div>
                            </div>
                        </div>

                        {/* Browser SDK */}
                        <div className="card overflow-hidden">
                            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                                <Terminal size={15} className="text-info" />
                                <h5 className="font-semibold text-sm text-text-heading">Browser / React SDK</h5>
                                <span className="ml-auto badge badge-secondary">@devtrace/browser-sdk</span>
                            </div>
                            <div className="p-5">
                                <p className="text-xs text-text-muted mb-3">Automatically capture frontend errors and unhandled rejections:</p>
                                <CodeBlock code={`npm install @devtrace/browser-sdk`} lang="bash" />
                                <div className="mt-3">
                                    <CodeBlock code={browserSnippet(selectedProject)} lang="tsx" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Empty state when no project selected */}
                {!selectedProject && !creating && (
                    <div className="card p-12 text-center">
                        <FolderOpen size={40} className="mx-auto mb-3 opacity-20" />
                        <p className="font-medium text-text-heading">Select a project</p>
                        <p className="text-sm text-text-muted mt-1">Choose a project on the left to view connection instructions, or create a new one.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
