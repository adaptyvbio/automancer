import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';


export function Checkbox(props: {
  label: string;
}) {
  return (
    <label className="sform-checkbox">
      <input type="checkbox" />
      <div>{props.label}</div>
    </label>
  );
}

export function CheckboxList(props: React.PropsWithChildren<{
  label: string;
}>) {
  return (
    <div className="sform-group">
      <div className="sform-label">{props.label}</div>
      <div className="sform-checkboxlist">
        {props.children}
      </div>
    </div>
  );
}

export function DurationField(props: React.PropsWithChildren<{
  label: string;
}>) {
  return (
    <div className="sform-group">
      <div className="sform-label">{props.label}</div>
      <div className="sform-durationfield">
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

export function Select<T extends string | null>(props: {
  label: string;
  onInput(value: T): void;
  options: {
    id: T;
    disabled?: unknown;
    label: string;
  }[];
  value: T;
}) {
  return (
    <label className="sform-group">
      <div className="sform-label">{props.label}</div>
      <div className="sform-select">
        <select value={props.value || ''} onInput={(event) => {
          let value = event.currentTarget.value;
          props.onInput(((value !== '') ? value : null) as T);
        }}>
          {props.options.map((option) =>
            <option value={option.id || ''} key={option.id}>{option.label}</option>
          )}
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
    <label className="sform-group">
      <div className="sform-label">{props.label}</div>
      <input type="text" className="sform-textfield" placeholder={props.placeholder} />
    </label>
  );
}
