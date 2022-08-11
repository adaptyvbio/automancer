import * as React from 'react';


export type ErrorBoundaryProps = React.PropsWithChildren<{
  getErrorMessage?(): JSX.Element;
}>;

export interface ErrorBoundaryState {
  hasError: false;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="eboundary">
          <p>{this.props.getErrorMessage?.() ?? 'An error occured.'} <button type="button" onClick={() => {
            this.setState({ hasError: false });
          }}>Retry</button></p>
        </div>
      );
    }

    return this.props.children;
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  static getDerivedStateFromProps() {
    return null;
  }
}
