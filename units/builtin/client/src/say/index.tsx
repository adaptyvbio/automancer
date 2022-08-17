import { Form, MatrixEditorProps } from 'pr1';
import { React } from 'pr1';


export const namespace = 'say';

export interface Matrix {
  voice: Voice['name'];
}

interface Voice {
  name: string;
  locale: string;
}

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const getVoiceOptions = (voices: Voice[]) => Object.entries(group(voices, (voice) => voice.locale))
  .map(([locale, voices]) => ({
    locale,
    localeLabel: languageNames.of(locale.replace('_', '-'))!,
    voices
  }))
  .sort((a, b) => a.localeLabel.localeCompare(b.localeLabel))
  .flatMap(({ locale, localeLabel, voices }) => {
    return [
      { id: locale, label: localeLabel, disabled: true },
      ...voices.map((voice) => ({ id: voice.name, label: voice.name }))
    ];
  });


export function MatrixEditor(props: MatrixEditorProps<Matrix>) {
  let executor = props.host.state.executors[namespace];
  let [testSample, setTestSample] = React.useState('');

  return (
    <>
      <div className="header header--2">
        <h2>Voice reports</h2>
      </div>
      <Form.Form>
        <Form.Select
          label="Voice"
          value={props.matrix.voice}
          onInput={(voiceName) => {
            props.setMatrix({ voice: voiceName });
          }}
          options={getVoiceOptions(executor.voices)} />
      </Form.Form>
      <Form.Form onSubmit={() => {
        setTestSample('');

        props.host.backend.command(props.chip.id, {
          [namespace]: {
            message: testSample
          }
        });
      }}>
        <Form.TextField
          label="Test sample"
          placeholder="Hello world"
          onInput={(value) => void setTestSample(value)}
          value={testSample} />
        <Form.Action type="submit" label="Test" />
      </Form.Form>
    </>
  );
}


function group<T>(arr: T[], fn: (item: T, index: number, arr: T[]) => string): Record<string, T[]>{
  let groups = {};

  for (let [index, item] of arr.entries()) {
    let groupName = fn(item, index, arr);
    groups[groupName] ??= [];
    groups[groupName].push(item);
  }

  return groups;
}
