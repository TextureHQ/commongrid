"use client";

import { Button, Card } from "@texturehq/edges";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  title?: string;
  level?: "page" | "component";
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error Boundary caught an error:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isPageLevel = this.props.level === "page";

      return (
        <div className={isPageLevel ? "flex min-h-screen items-center justify-center p-4" : ""}>
          <Card>
            <div className="flex flex-col items-center justify-center gap-4 p-6" data-testid="error-boundary">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {this.props.title || "Something went wrong"}
              </h2>
              <p className="text-center text-red-600 dark:text-red-400">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <div className="flex gap-3">
                <Button onClick={this.handleRetry} variant="primary">
                  Try Again
                </Button>
                {isPageLevel && (
                  <Button onClick={this.handleGoHome} variant="secondary">
                    Go to Home
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
