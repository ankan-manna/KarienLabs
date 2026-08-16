import { Component, type ErrorInfo, type ReactNode } from 'react';

import ServerErrorPage from '../../pages/errors/ServerErrorPage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) return <ServerErrorPage />;
    return this.props.children;
  }
}
