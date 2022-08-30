import * as React from 'react';

import type { Host } from '../host';
import { ErrorBoundary } from './error-boundary';
import { Chip, ChipId } from '../backends/common';
import { sortUnits } from '../sort';
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
          {Object.values(this.props.host.units)
            .filter((unit) => this.chip.unitList.includes(unit.namespace) && unit.MatrixEditor)
            .sort(sortUnits)
            .map((unit) => {
              let Component = unit.MatrixEditor!;

              return (
                <ErrorBoundary
                  getErrorMessage={() => <>Failed to render the settings editor of unit <strong>{unit.namespace}</strong>.</>}
                  key={unit.namespace}>
                  <Component
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
