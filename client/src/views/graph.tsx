import * as React from 'react';

import { GraphEditor } from '../components/graph-editor';


export interface ViewGraphProps {

}

export interface ViewGraphState {

}

export class ViewGraph extends React.Component<ViewGraphProps, ViewGraphState> {
  constructor(props: ViewGraphProps) {
    super(props);

    this.state = {};
  }

  render() {
    return (
      <main className="blayout-container">
        <header className="blayout-header">
          <h1>Graph</h1>
        </header>
        <GraphEditor />
      </main>
    );
  }
}
