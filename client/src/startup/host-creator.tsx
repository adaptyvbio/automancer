import * as React from 'react';

import type { HostSettings } from '../host';
import { Pool } from '../util';
import { PythonInstallation, PythonInstallationRecord as PythonInstallationsRecord } from './interfaces';

import * as S0 from './steps/s0';
import * as S1 from './steps/s1';
import * as S2 from './steps/s2';
import * as S3 from './steps/s3';
import * as S4 from './steps/s4';
import * as S5 from './steps/s5';
import * as S6 from './steps/s6';


export interface HostCreatorContext {
  computerName: string;
  pythonInstallations: PythonInstallationsRecord;
}

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
  | S4.Data
  | S5.Data
  | S6.Data;

export interface HostCreatorState {
  context: HostCreatorContext | null;
  data: HostCreatorData;
}

export class HostCreator extends React.Component<HostCreatorProps, HostCreatorState> {
  pool = new Pool();

  constructor(props: HostCreatorProps) {
    super(props);

    this.state = {
      context: null,
      data: {
        stepIndex: 4,
        mode: null
      }
    };
  }

  componentDidMount() {
    this.pool.add(async () => {
      let context = await window.api.hostSettings.getCreatorContext();
      this.setState({ context });
    });
  }

  render() {
    if (!this.state.context) {
      return <></>;
    }

    let Step = [
      S0.Component,
      S1.Component,
      S2.Component,
      S3.Component,
      S4.Component,
      S5.Component,
      S6.Component
    ][this.state.data.stepIndex] as HostCreatorStepComponent<unknown>;

    return (
      <Step
        cancel={this.props.onCancel}
        context={this.state.context}
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

  context: HostCreatorContext;
  data: Data;
  setData(data: HostCreatorData | Omit<Data, 'stepIndex'>): void;
}

export type HostCreatorStepComponent<Data> = React.FunctionComponent<HostCreatorStepProps<Data>>;
