import { setIn } from 'immutable';
import * as React from 'react';

import type { Host, Route } from '../application';
// import { Chip, HostState } from '../backends/common';
import { Chip, ChipId, ChipModel, ControlNamespace, HostId } from '../backends/common';
import { Pool } from '../util';
import * as util from '../util';
import { Icon } from '../components/icon';
import { Matrices, Units } from '../units';


export interface ChipSettingsProps {
  chipId: ChipId;
  host: Host;
}

export interface ChipSettingsState {
  description: string;
  name: string;
}

export class ChipSettings extends React.Component<ChipSettingsProps, ChipSettingsState> {
  pool = new Pool();

  constructor(props: ChipSettingsProps) {
    super(props);

    this.state = {
      description: this.chip.metadata.description ?? '',
      name: this.chip.name
    };
  }

  get chip(): Chip {
    return this.props.host.state.chips[this.props.chipId];
  }

  get model(): ChipModel {
    return this.props.host.state.models[this.chip.modelId];
  }

  componentDidUpdate(prevProps: ChipSettingsProps) {
    if ((prevProps !== this.props)) {
      if (this.state.description !== (this.chip.metadata.description ?? '')) {
        this.setState({ description: this.chip.metadata.description ?? '' });
      }

      if (this.state.name !== this.chip.name) {
        this.setState({ name: this.chip.name });
      }
    }
  }

  render() {
    return (
      <div className="blayout-contents">
        <div className="form-container">
          <div className="header header--2">
            <h2>General</h2>
          </div>

          {/* <p>These will be conserved once the chip is archived.</p> */}

          <label className="form-control">
            <div>Name</div>
            <input
              type="text"
              placeholder="e.g. Alpha"
              value={this.state.name}
              onInput={(event) => {
                this.setState({ name: event.currentTarget.value });
              }}
              onBlur={() => {
                this.pool.add(async () => {
                  if (this.state.name) {
                    await this.props.host.backend.setChipMetadata(this.chip.id, { name: this.state.name });
                  }
                });
              }} />
          </label>
          <label className="form-control">
            <div>Details</div>
            <textarea placeholder="e.g. Produced on March 23rd"
              onInput={(event) => {
                this.setState({ description: event.currentTarget.value });
              }}
              onBlur={() => {
                this.pool.add(async () => {
                  await this.props.host.backend.setChipMetadata(this.chip.id, { description: (this.state.description || null) });
                });
              }}
              value={this.state.description} />
          </label>

          {Units.map(([namespace, unit]) => {
            if (!unit.MatrixEditor) {
              return null;
            }

            return <unit.MatrixEditor
              chip={this.chip}
              host={this.props.host}
              model={this.model}
              matrix={this.chip.matrices[namespace as keyof Matrices]}
              setMatrix={(matrix) => {
                this.pool.add(async () => {
                  await this.props.host.backend.setMatrix(this.chip.id, {
                    [namespace]: matrix
                  });
                });
              }}
              key={namespace} />
          })}
        </div>
      </div>
    );
  }
}
