import * as React from 'react';

import { Icon } from '../components/icon';
import * as util from '../util';


export type OrdinaryId = number | string;

export function Selector<EntryId extends OrdinaryId, Entry extends {
  id: EntryId;
  key?: string;
  name: string;
  description?: string;
  icon: string;
  disabled?: unknown;
}>(props: {
entries: Entry[];
onSelect(id: EntryId): void;
selectedEntryId: EntryId | null;
}) {
return (
  <div className="selector-root">
    {props.entries.map((entry) => (
      <button type="button"
        className={util.formatClass('selector-entry', { '_selected': (entry.id === props.selectedEntryId) })}
        disabled={!!entry.disabled}
        key={entry.id}
        onClick={() => {
          props.onSelect(entry.id);
        }}>
        <div className="selector-entry-icon">
          <Icon name={entry.icon} />
        </div>
        <div className="selector-entry-name">{entry.name}</div>
        <div className="selector-entry-icon">
          <Icon name="check_circle" />
        </div>
        <p className="selector-entry-desc">{entry.description}</p>
      </button>
    ))}
  </div>
);
}
