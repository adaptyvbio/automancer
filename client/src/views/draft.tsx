import * as React from 'react';

import type { Draft, Host, Route } from '../application';
import { Icon } from '../components/icon';
import * as util from '../util';
import { Pool } from '../util';


export interface ViewDraftProps {
  draft: Draft;
  host: Host;
  setRoute(route: Route): void;
}

export class ViewDraft extends React.Component<ViewDraftProps> {
  render() {
    return (
      <main>
        <h1>Draft</h1>
      </main>
    );
  }
}
