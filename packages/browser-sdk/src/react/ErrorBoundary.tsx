import React, { Component, ErrorInfo, ReactNode } from 'react';
import { DevTraceBrowser } from '../client';

interface ErrorBoundaryProps {
    devtrace: DevTraceBrowser;
    fallback?: ReactNode | ((error: Error) => ReactNode);
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.props.devtrace.captureError(error, {
            metadata: {
                reactComponentStack: errorInfo.componentStack,
                source: 'react-error-boundary'
            }
        });
    }

    render() {
        if (this.state.hasError && this.state.error) {
            if (typeof this.props.fallback === 'function') {
                return this.props.fallback(this.state.error);
            }
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return null; // Silent fail if no fallback provided
        }

        return this.props.children;
    }
}
