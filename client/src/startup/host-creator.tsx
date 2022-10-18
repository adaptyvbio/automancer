import * as React from 'react';

import type { HostSettings } from '../host';
import { Pool } from '../util';

import * as S0 from './steps/s0';
import * as S1 from './steps/s1';
import * as S2 from './steps/s2';
import * as S3 from './steps/s3';
import * as S4 from './steps/s4';


const pool = new Pool();


export interface HostCreatorProps {
  onCancel(): void;
  onDone(result: {
    settings: HostSettings;
  }): void;
}

export type HostCreatorData =
    S0.Data
  | S1.Data
  | S2.Data
  | S3.Data
  | S4.Data;

export interface HostCreatorState {
  data: HostCreatorData;
}

export class HostCreator extends React.Component<HostCreatorProps, HostCreatorState> {
  constructor(props: HostCreatorProps) {
    super(props);

    this.state = {
      data: {
        stepIndex: 4,
        mode: null
      }
    };
  }

  render() {
    let Step = [
      S0.Component,
      S1.Component,
      S2.Component,
      S3.Component,
      S4.Component
    ][this.state.data.stepIndex] as HostCreatorStepComponent<unknown>;

    return (
      <Step
        cancel={this.props.onCancel}
        done={this.props.onDone}
        data={this.state.data}
        setData={(data) => {
          this.setState({
            data: ({ stepIndex: this.state.data.stepIndex, ...data } as HostCreatorData)
          });
        }} />
    );
  }
}


export interface HostCreatorStepData {
  stepIndex: number;
}

export interface HostCreatorStepProps<Data = HostCreatorData> {
  cancel(): void;
  done(result: {
    settings: HostSettings;
  }): void;

  data: Data;
  setData(data: HostCreatorData | Omit<Data, 'stepIndex'>): void;
}

export type HostCreatorStepComponent<Data> = React.FunctionComponent<HostCreatorStepProps<Data>>;
