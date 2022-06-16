import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';


export function Checkbox(props: {
  label: string;
}) {
  return (
    <label className="veditor-inspector-checkbox">
      <input type="checkbox" />
      <div>{props.label}</div>
    </label>
  );
}

export function CheckboxList(props: React.PropsWithChildren<{
  label: string;
}>) {
  return (
    <div className="veditor-inspector-group">
      <div className="veditor-inspector-label">{props.label}</div>
      <div className="veditor-inspector-checkboxlist">
        {props.children}
      </div>
    </div>
  );
}

export function DurationField(props: React.PropsWithChildren<{
  label: string;
}>) {
  return (
    <div className="veditor-inspector-group">
      <div className="veditor-inspector-label">{props.label}</div>
      <div className="veditor-inspector-durationfield">
        <label>
          <input type="text" placeholder="0" />
          <div>hrs</div>
        </label>
        <label>
          <input type="text" placeholder="0" />
          <div>min</div>
        </label>
        <label>
          <input type="text" placeholder="0" />
          <div>sec</div>
        </label>
        <label>
          <input type="text" placeholder="0" />
          <div>ms</div>
        </label>
      </div>
    </div>
  );
}

export function Select(props: React.PropsWithChildren<{
  label: string;
  onInput(event: React.FormEvent<HTMLSelectElement>): void;
  value: string;
}>) {
  return (
    <label className="veditor-inspector-group">
      <div className="veditor-inspector-label">{props.label}</div>
      <div className="veditor-inspector-select">
        <select value={props.value} onInput={props.onInput}>
          {props.children}
        </select>
        <Icon name="expand_more" />
      </div>
    </label>
  );
}

export function TextField(props: {
  label: string;
  placeholder: string;
}) {
  return (
    <label className="veditor-inspector-group">
      <div className="veditor-inspector-label">{props.label}</div>
      <input type="text" className="veditor-inspector-textfield" placeholder={props.placeholder} />
    </label>
  );
}
