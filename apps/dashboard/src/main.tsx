import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DevTraceBrowser } from '@devtrace/browser-sdk'
import { ErrorBoundary } from '@devtrace/browser-sdk/react'

const devtrace = new DevTraceBrowser({
  projectId: 'proj-1', // Using the seeded project ID
  collectorUrl: 'http://localhost:4310',
  service: 'dashboard-ui',
  environment: 'development',
  captureConsoleErrors: true
});

devtrace.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary devtrace={devtrace} fallback={<div className="p-10 text-red-500">A fatal error occurred!</div>}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
