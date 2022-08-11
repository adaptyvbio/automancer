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

export function Form(props: React.PropsWithChildren<{}>) {
  return (
    <div className="sform-form">
      {props.children}
    </div>
  );
}

export function Header(props: React.PropsWithChildren<{}>) {
  return (
    <div className="sform-header">{props.children}</div>
  );
}

export function Select<T extends number | string | null>(props: {
  label: string;
  onInput(value: T): void;
  options: {
    id: T;
    disabled?: unknown;
    label: string;
  }[];
  targetRef?: React.RefObject<HTMLSelectElement>;
  value: T;
}) {
  return (
    <label className="sform-group">
      <div className="sform-label">{props.label}</div>
      <div className="sform-select">
        <select
          value={props.options.findIndex((option) => option.id === props.value)}
          onInput={(event) => {
            let optionIndex = parseInt(event.currentTarget.value);
            props.onInput(props.options[optionIndex].id);
          }}
          ref={props.targetRef}>
          {props.options.map((option, optionIndex) =>
            <option value={optionIndex} disabled={!!option.disabled} key={option.id}>{option.label}</option>
          )}
        </select>
        <Icon name="expand_more" />
      </div>
    </label>
  );
}

export function TextArea(props: {
  label: string;
  onBlur?(): void;
  onInput(value: string): void;
  placeholder?: string;
  targetRef?: React.RefObject<HTMLTextAreaElement>;
  value: string;
}) {
  return (
    <label className="sform-group">
      <div className="sform-label">{props.label}</div>
      <textarea className="sform-textarea"
        placeholder={props.placeholder}
        onBlur={props.onBlur}
        onInput={(event) => void props.onInput(event.currentTarget.value)}
        value={props.value}
        rows={3}
        ref={props.targetRef} />
    </label>
  );
}

export function TextField(props: {
  label: string;
  onBlur?(): void;
  onInput(value: string): void;
  placeholder?: string;
  targetRef?: React.RefObject<HTMLInputElement>;
  value: string;
}) {
  return (
    <label className="sform-group">
      <div className="sform-label">{props.label}</div>
      <input type="text" className="sform-textfield"
        placeholder={props.placeholder}
        onBlur={props.onBlur}
        onInput={(event) => void props.onInput(event.currentTarget.value)}
        value={props.value}
        ref={props.targetRef} />
    </label>
  );
}
