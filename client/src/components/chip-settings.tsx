import { setIn } from 'immutable';
import * as React from 'react';

import type { Host } from '../host';
import { ErrorBoundary } from './error-boundary';
import { Chip, ChipId, HostId } from '../backends/common';
import { Pool } from '../util';


export interface ChipSettingsProps {
  chipId: ChipId;
  host: Host;
}

export interface ChipSettingsState {

}

export class ChipSettings extends React.Component<ChipSettingsProps, ChipSettingsState> {
  pool = new Pool();

  constructor(props: ChipSettingsProps) {
    super(props);
  }

  get chip(): Chip {
    return this.props.host.state.chips[this.props.chipId] as Chip;
  }

  render() {
    return (
      <div className="blayout-contents" style={{ overflow: 'auto', padding: '0 3px' }}>
        <div>
          {Object.values(this.props.host.units).map((unit) => {
            if (!unit.MatrixEditor) {
              return null;
            }

            return (
              <ErrorBoundary
                getErrorMessage={() => <>Failed to render the settings editor of unit <strong>{unit.namespace}</strong>.</>}
                key={unit.namespace}>
                <unit.MatrixEditor
                  chip={this.chip}
                  host={this.props.host} />
              </ErrorBoundary>
            );
          })}
        </div>
      </div>
    );
  }
}
