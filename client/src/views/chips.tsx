import * as React from 'react';
import seqOrd from 'seq-ord';

import { DraftEntry } from './protocols';
import type { Route } from '../application';
import type { Host } from '../host';
import { Chip, ChipCondition, ChipId } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
import { Icon } from '../components/icon';
import { Pool } from '../util';
import { formatRelativeDate } from '../format';
import { getChipMetadata } from '../backends/misc';


export interface ViewChipsProps {
  host: Host;
  setRoute(route: Route): void;
}

export class ViewChips extends React.Component<ViewChipsProps> {
  pool = new Pool();
  chipIdAwaitingRedirect: ChipId | null = null;

  componentDidUpdate() {
    if (this.chipIdAwaitingRedirect && (this.chipIdAwaitingRedirect in this.props.host.state.chips)) {
      this.props.setRoute(['chip', this.chipIdAwaitingRedirect, 'settings']);
    }
  }

  render() {
    let chips = Object.values(this.props.host.state.chips);
    let activeChips = (chips.filter(chip => (chip.condition === ChipCondition.Ok)) as Chip[])
      .sort((a, b) => getChipMetadata(b).creationDate - getChipMetadata(a).creationDate);

    let pastChips = chips
      .filter(chip => (chip.condition !== ChipCondition.Ok))
      .sort(seqOrd(function* (a, b, rules) {
        yield rules.numeric(a.condition, b.condition);
      }));

    return (
      <main>
        <header className="header header--1">
          <h1>Experiments</h1>
        </header>

        <div className="header header--2">
          <h2>Active experiments</h2>
          <button type="button" className="btn" onClick={() => {
            this.pool.add(async () => {
              let result = await this.props.host.backend.createChip();
              this.chipIdAwaitingRedirect = result.chipId;
            });
          }}>
            <div>New experiment</div>
          </button>
        </div>

        {(activeChips.length > 0)
          ? (
            <div className="clist-root">
              {activeChips.map((chip) => {
                let metadata = getChipMetadata(chip);
                let previewUrl: string | null = null;

                for (let unit of Object.values(this.props.host.units)) {
                  if (chip.unitList.includes(unit.namespace)) {
                    previewUrl ??= unit.providePreview?.({ chip, host: this.props.host }) ?? null;

                    if (previewUrl) {
                      break;
                    }
                  }
                }

                return (
                  <ContextMenuArea
                    createMenu={(_event) => [
                      { id: 'duplicate', name: 'Duplicate', icon: 'content_copy', disabled: true },
                      { id: 'reveal', name: 'Reveal in Finder', icon: 'folder', disabled: true },
                      { id: '_divider', type: 'divider' },
                      { id: 'archive', name: 'Archive', icon: 'archive', disabled: true },
                      { id: 'delete', name: 'Move to trash', icon: 'delete', disabled: true }
                    ]}
                    onSelect={(_path) => { }}
                    key={chip.id}>
                    <button type="button" className="clist-entrywide" onClick={() => {
                      this.props.setRoute(['chip', chip.id, 'settings']);
                    }}>
                      <div className="clist-header">
                        <div className="clist-title">{metadata.title}</div>
                      </div>
                      <dl className="clist-data">
                        <dt>Created</dt>
                        <dd>{formatRelativeDate(metadata.creationDate)}</dd>
                        <dt>Protocol</dt>
                        <dd>{chip.master?.protocol.name ?? 'Idle'}</dd>
                      </dl>
                      {previewUrl && (
                        <div className="clist-preview">
                          <img src={previewUrl} />
                        </div>
                      )}
                    </button>
                  </ContextMenuArea>
                );
              })}
            </div>
          )
          : (
            <div className="clist-blank">
              <p>No active experiment</p>
            </div>
          )}

        {(pastChips.length > 0) && (
          <>
            <header className="header header--2">
              <h2>Past experiments</h2>
            </header>

            <div className="lproto-container">
              <div className="lproto-list">
                {pastChips.map((chip) => {
                  console.log(chip)

                  switch (chip.condition) {
                    case ChipCondition.Unsupported: return (
                      <DraftEntry
                        createMenu={() => []}
                        disabled={true}
                        name="[Unsupported experiment]"
                        onSelect={() => { }}
                        properties={[
                          { id: 'issues', label: chip.issues[0] ?? '–', icon: 'error' }
                        ]}
                        key={chip.id} />
                    );

                    case ChipCondition.Corrupted: return (
                      <DraftEntry
                        createMenu={() => []}
                        disabled={true}
                        name="[Corrupted experiment]"
                        onSelect={() => { }}
                        properties={[
                          { id: 'corrupted', label: 'Corrupted', icon: 'broken_image' }
                        ]}
                        key={chip.id} />
                    );
                  }
                })}
              </div>
            </div>
          </>
        )}
      </main>
    )
  }
}
