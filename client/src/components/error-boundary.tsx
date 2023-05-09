import * as React from 'react';

import * as util from '../util';

import styles from '../../styles/components/error-boundary.module.scss';


export type ErrorBoundaryProps = React.PropsWithChildren<{
  getErrorMessage?(): JSX.Element;
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
        <div className={styles.root}>
          <p>{this.props.getErrorMessage?.() ?? 'An error has occured.'} <button type="button" onClick={() => {
            this.setState({ hasError: false });
          }}>Reload</button></p>
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
