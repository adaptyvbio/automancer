import { setIn } from 'immutable';
import * as React from 'react';

import type { Host } from '../host';
import { ErrorBoundary } from './error-boundary';
import { Chip, ChipId, ControlNamespace, HostId } from '../backends/common';
import { Pool } from '../util';
import * as util from '../util';
import { Icon } from '../components/icon';
import { Matrices, Units } from '../units';
import * as Form from './standard-form';


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
        <div>
          <div className="header header--2">
            <h2>General</h2>
          </div>

          <Form.Form>
            <Form.TextField
              label="Name"
              onInput={(name) => {
                this.setState({ name });
              }}
              onBlur={() => {
                this.pool.add(async () => {
                  if (this.state.name) {
                    await this.props.host.backend.setChipMetadata(this.chip.id, { name: this.state.name });
                  }
                });
              }}
              placeholder="e.g. Alpha"
              value={this.state.name} />

            <Form.TextArea
              label="Description"
              onInput={(description) => {
                this.setState({ description });
              }}
              onBlur={() => {
                this.pool.add(async () => {
                  if (this.state.description) {
                    await this.props.host.backend.setChipMetadata(this.chip.id, { description: this.state.description });
                  }
                });
              }}
              placeholder="e.g. Produced on March 23rd"
              value={this.state.description} />
          </Form.Form>

          {Object.values(this.props.host.units).map((unit) => {
            if (!unit.MatrixEditor) {
              return null;
            }

            return (
              <ErrorBoundary
                getErrorMessage={() => <>Failed to render the settings editor of unit <strong>{unit.name}</strong>.</>}
                key={unit.name}>
                <unit.MatrixEditor
                  chip={this.chip}
                  host={this.props.host}
                  matrix={this.chip.matrices[unit.name as keyof Matrices]}
                  setMatrix={(matrix) => {
                    this.pool.add(async () => {
                      await this.props.host.backend.setMatrix(this.chip.id, {
                        [unit.name]: matrix
                      });
                    });
                  }} />
              </ErrorBoundary>
            );
          })}
        </div>
      </div>
    );
  }
}
