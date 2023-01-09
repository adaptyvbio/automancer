import React from 'react';

import { Icon } from './icon';
import { Button } from './button';

import descriptionStyles from '../../styles/components/description.module.scss';
import { PossibleLink } from './possible-link';


export interface ItemListEntry {
  id: string;
  description?: React.ReactNode;
  label: string;

  action?: {
    type: 'explicit';
    contents: React.ReactNode;
  } | {
    type: 'link';
    target: string;
  } | null;
}

export type ItemListDef = ItemListEntry[];

export function ItemList(props: {
  entries: ItemListDef;
}) {
  return (
    <div className={descriptionStyles.itemlistRoot}>
      {props.entries.map((entry) => (
        <PossibleLink
          {...(entry.action?.type === 'link'
            ? { kind: 'anchor', href: entry.action.target }
            : { kind: 'div' })}
          className={descriptionStyles.itemlistEntry}
          key={entry.id}>
          <div className={descriptionStyles.itemlistDetails}>
            <div className={descriptionStyles.itemlistLabel}>{entry.label}</div>
            {entry.description && <div className={descriptionStyles.itemlistDescription}>{entry.description}</div>}
          </div>
          {(entry.action?.type === 'link') && (
            <Icon name="chevron_right" style="sharp" className={descriptionStyles.itemlistChevron} />
          )}
          {(entry.action?.type === 'explicit' && (
            <div className={descriptionStyles.itemlistAction}>
              {entry.action.contents}
            </div>
          ))}
        </PossibleLink>
      ))}
    </div>
  );
}
