import * as React from 'react';

import type { OrdinaryId } from '../interfaces/util';
import { Icon } from './icon';


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
      <label className="selector-input" key={entry.id}>
        <input type="radio" name="a" checked={entry.id === props.selectedEntryId} disabled={!!entry.disabled} onChange={() => {
          props.onSelect(entry.id);
        }} />
        <div className="selector-entry">
          <div className="selector-entry-icon">
            <Icon name={entry.icon} />
          </div>
          <div className="selector-entry-name">{entry.name}</div>
          <div className="selector-entry-icon">
            <Icon name="check_circle" />
          </div>
          <p className="selector-entry-desc">{entry.description}</p>
        </div>
      </label>
    ))}
  </div>
);
}
