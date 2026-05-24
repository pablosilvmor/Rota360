import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    const { hasError } = this.state;
    const { fallback, children } = this.props;

    if (hasError) {
      return fallback || (
        <div className="p-8 text-center bg-error-container text-on-error-container rounded-2xl m-4 border border-error/20">
          <span className="material-symbols-outlined text-[48px] mb-2">error</span>
          <h2 className="text-xl font-bold mb-2">Algo deu errado nesta tela</h2>
          <p className="text-sm opacity-80 mb-4">Ocorreu um erro ao carregar os componentes. Tente recarregar a página.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-error text-white rounded-lg font-bold"
          >
            Recarregar
          </button>
        </div>
      );
    }

    return children;
  }
}
