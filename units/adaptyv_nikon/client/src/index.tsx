import { CreateFeaturesOptions, Features, Form, MatrixEditorProps } from 'pr1';
import { React } from 'pr1';


export const namespace = 'adaptyv_nikon';


export type Command = {
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

export interface SegmentData {
  exposure: number;
  objective: string;
  optconf: string;
}


export function MatrixEditor(props: MatrixEditorProps) {
  let executor = props.host.state.executors[namespace] as ExecutorState;
  let runner = props.chip.runners[namespace] as Runner;

  let [rawChipCount, setRawChipCount] = React.useState(runner.chipCount.toString());

  let command = (command: Command) => {
    props.host.backend.command({
      chipId: props.chip.id,
      namespace,
      command
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
              command({ type: 'set', chipCount });
              setRawChipCount(chipCount.toString());
            } else {
              setRawChipCount(runner.chipCount.toString());
            }
          }}
          onInput={(value) => void setRawChipCount(value)}
          value={rawChipCount} />
        <Form.Action label="Query points" onClick={() => {
          command({ type: 'queryPoints' });
        }} />
      </Form.Form>
    </>
  );
}


export function createFeatures(options: CreateFeaturesOptions): Features {
  let segmentData = options.segment.data[namespace] as SegmentData;

  return segmentData
    ? [{
      icon: 'biotech',
      label: 'Capture'
    }]
    : [];
}
