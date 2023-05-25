import { Form, Plugin, createProcessBlockImpl } from 'pr1';
import { PluginName, ProtocolBlockName } from 'pr1-shared';
import { useState } from 'react';


export type RunnerRequest = {
  type: 'queryPoints';
} | {
  type: 'set';
  chipCount: number;
};

export interface ExecutorState {
  objectives: string[];
  optconfs: string[];
}

export interface Runner {
  chipCount: number;
  pointsSaved: number;
}

export interface ProcessData {
  exposure: number;
  objective: string;
  optconf: string;
}


const namespace = ('adaptyv_nikon' as PluginName);

export default {
  namespace,
  blocks: {
    ['_' as ProtocolBlockName]: createProcessBlockImpl<ProcessData, never>({
      createFeatures(data, location) {
        return [{
          icon: 'biotech',
          label: 'Capture'
        }];
      }
    })
  },

  RunnerComponent(props) {
    let executor = props.context.host.state.executors[namespace] as ExecutorState;
    let runner = props.experiment.runners[namespace] as Runner;

    let [rawChipCount, setRawChipCount] = useState(runner.chipCount.toString());

    let request = (request: RunnerRequest) => {
      props.context.pool.add(async () => {
        await props.context.requestToRunner(request, props.experiment.id);
      });
    };

    return (
      <>
        <div className="header header--2">
          <h2>Imaging</h2>
        </div>

        <dl>
          <dt><b>Objectives</b></dt>
          <dd>
            <ul>
              {executor.objectives.map((objective) => <li>{objective}</li>)}
            </ul>
          </dd>
          <dt><b>Optical configurations</b></dt>
          <dd>
            <ul>
              {executor.optconfs.map((optconf) => <li>{optconf}</li>)}
            </ul>
          </dd>
        </dl>

        <p>Points saved: {runner.pointsSaved ? 'yes' : 'no'}</p>

        <Form.Form>
          <Form.TextField
            label="Chip count"
            onBlur={() => {
              let chipCount = parseInt(rawChipCount);

              if ((chipCount > 0) && (chipCount <= 5) && (chipCount.toString() === rawChipCount.trim())) {
                request({ type: 'set', chipCount });
                setRawChipCount(chipCount.toString());
              } else {
                setRawChipCount(runner.chipCount.toString());
              }
            }}
            onInput={(value) => void setRawChipCount(value)}
            value={rawChipCount} />
          <Form.Action label="Query points" onClick={() => {
            request({ type: 'queryPoints' });
          }} />
        </Form.Form>
      </>
    );
  }
} satisfies Plugin
