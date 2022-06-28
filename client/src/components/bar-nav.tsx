import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';


export function BarNav<Id extends number | string>(props: {
  entries: {
    id: Id;
    label: string;
    icon: string;
    disabled?: unknown;
  }[];
  selectEntry(entryId: Id): void;
  selectedEntryId: Id | null;
}) {
  return (
    <nav className="barnav-root">
      {props.entries.map((entry) => (
        <button type="button"
          className={util.formatClass('barnav-entry', { '_selected': entry.id === props.selectedEntryId })}
          disabled={!!entry.disabled}
          key={entry.id}
          onClick={() => {
            props.selectEntry(entry.id);
          }}>
          <div className="barnav-icon">
            <Icon name={entry.icon} />
          </div>
          <div className="barnav-label">{entry.label}</div>
        </button>
      ))}
    </nav>
  );
}
