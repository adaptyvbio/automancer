import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';


export function BarNav<Id extends number | string>(props: {
  entries: {
    id: Id;
    href: string;
    label: string;
    icon: string;
    disabled?: unknown;
  }[];
  selectedEntryId: Id | null;
}) {
  return (
    <nav className="barnav-root">
      {props.entries.map((entry) => (
        <a
          href={entry.href}
          className={util.formatClass('barnav-entry', {
            '_disabled': entry.disabled,
            '_selected': entry.id === props.selectedEntryId
          })}
          key={entry.id}>
          <div className="barnav-icon">
            <Icon name={entry.icon} />
          </div>
          <div className="barnav-label">{entry.label}</div>
        </a>
      ))}
    </nav>
  );
}
