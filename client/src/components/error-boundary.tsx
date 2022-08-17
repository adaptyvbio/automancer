import * as React from 'react';


export type ErrorBoundaryProps = React.PropsWithChildren<{
  getErrorMessage?(): JSX.Element;
  wide?: unknown;
}>;

export interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="eboundary" style={this.props.wide ? {} : { height: '220px' }}>
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
