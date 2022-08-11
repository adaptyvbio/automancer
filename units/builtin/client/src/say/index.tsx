import { Form, MatrixEditorProps } from 'pr1';
import React from 'react';

import Voices from './voices';


export const name = 'say';

export interface Matrix {
  voice: string;
}

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const voiceOptions = Object.entries(group(Voices, (voice) => voice.locale))
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
  return (
    <div>
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
          options={voiceOptions} />
      </Form.Form>
    </div>
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
