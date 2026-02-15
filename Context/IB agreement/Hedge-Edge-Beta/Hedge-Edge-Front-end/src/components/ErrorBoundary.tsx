/**
 * React Error Boundary Component
 * ===============================
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them, and displays a fallback UI instead of crashing.
 */

import React, { Component, ReactNode } from 'react';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Optional custom fallback UI */
  fallback?: ReactNode;
  /** Component name for logging context */
  componentName?: string;
  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Whether to show detailed error info (dev only) */
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// ============================================================================
// Error Boundary Component
// ============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private scopedLogger = logger.scope(this.props.componentName || 'ErrorBoundary');

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log the error
    this.scopedLogger.error('React component error caught', {
      error,
      metadata: {
        componentStack: errorInfo.componentStack,
      },
    });

    // Update state with error info
    this.setState({ errorInfo });

    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.scopedLogger.info('User triggered error recovery retry');
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoHome = (): void => {
    this.scopedLogger.info('User navigating home after error');
    window.location.href = '/';
  };

  handleReload = (): void => {
    this.scopedLogger.info('User reloading page after error');
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, showDetails } = this.props;

    if (hasError) {
      // Custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
          
          <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            An unexpected error occurred. You can try again or return to the home page.
          </p>

          <div className="flex gap-3 mb-6">
            <Button onClick={this.handleRetry} variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={this.handleGoHome} variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </div>

          {/* Show error details in development */}
          {(showDetails || import.meta.env.DEV) && error && (
            <details className="w-full max-w-2xl text-left mt-4">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                Technical Details
              </summary>
              <div className="mt-2 p-4 bg-muted rounded-lg overflow-auto">
                <p className="font-mono text-sm text-destructive mb-2">
                  {error.name}: {error.message}
                </p>
                {errorInfo?.componentStack && (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {errorInfo.componentStack}
                  </pre>
                )}
              </div>
            </details>
          )}
        </div>
      );
    }

    return children;
  }
}

// ============================================================================
// HOC for wrapping components with error boundary
// ============================================================================

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary componentName={displayName} {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

// ============================================================================
// Page-level Error Boundary with more comprehensive UI
// ============================================================================

interface PageErrorBoundaryProps {
  children: ReactNode;
  pageName?: string;
}

export function PageErrorBoundary({ children, pageName }: PageErrorBoundaryProps) {
  return (
    <ErrorBoundary
      componentName={pageName || 'Page'}
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-background">
          <div className="rounded-full bg-destructive/10 p-6 mb-6">
            <AlertTriangle className="h-16 w-16 text-destructive" />
          </div>
          
          <h1 className="text-3xl font-bold mb-2">Page Error</h1>
          <p className="text-muted-foreground mb-8 max-w-md text-center">
            This page encountered an error and couldn't be displayed.
            Our team has been notified.
          </p>

          <div className="flex gap-4">
            <Button onClick={() => window.location.reload()} size="lg">
              <RefreshCw className="h-5 w-5 mr-2" />
              Reload Page
            </Button>
            <Button onClick={() => window.location.href = '/'} variant="outline" size="lg">
              <Home className="h-5 w-5 mr-2" />
              Go to Dashboard
            </Button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
