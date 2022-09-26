import * as React from 'react';
import seqOrd from 'seq-ord';

import { DraftEntry } from './protocols';
import type { Route } from '../application';
import type { Host } from '../host';
import { Chip, ChipCondition, ChipId } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
import { Icon } from '../components/icon';
import { TimeSensitive } from '../components/time-sensitive';
import { Pool } from '../util';
import { formatRelativeDate } from '../format';


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
    let metadataTools = this.props.host.units.metadata as unknown as {
      archiveChip(host: Host, chip: Chip, value: boolean): Promise<void>;
      getChipMetadata(chip: Chip): { archived: boolean; creationDate: number; title: string; description: string; };
    };

    let chips = Object.values(this.props.host.state.chips);
    let readableChips = (chips.filter((chip) => chip.readable) as Chip[])
      .map((chip) => ({ chip, metadata: metadataTools.getChipMetadata(chip) }))
      .sort((a, b) => b.metadata.creationDate - a.metadata.creationDate);

    let activeChips = readableChips
      .filter(({ metadata }) => !metadata.archived)

    let pastChips = [
      ...readableChips.filter(({ metadata }) => metadata.archived),
      ...chips
        .map((chip) => ({ chip, metadata: null }))
        .filter(({ chip }) => !chip.readable)
        .sort(seqOrd(function* (a, b, rules) {
          yield rules.numeric(a.chip.condition, b.chip.condition);
        }))
    ] /* satisfies Chip */;


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
              {activeChips.map(({ chip, metadata }) => {
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
                      { id: 'reveal', name: 'Reveal in explorer', icon: 'folder_open' },
                      { id: '_divider', type: 'divider' },
                      { id: 'archive', name: 'Archive', icon: 'archive' },
                      { id: 'delete', name: 'Move to trash', icon: 'delete' }
                    ]}
                    onSelect={(path) => {
                      switch (path.first()) {
                        case 'archive': {
                          this.pool.add(async () => {
                            await metadataTools.archiveChip!(this.props.host, chip, true);
                          });

                          break;
                        }

                        case 'delete': {
                          this.pool.add(async () => {
                            await this.props.host.backend.deleteChip(chip.id, { trash: true });
                          });

                          break;
                        }

                        case 'reveal': {
                          this.pool.add(async () => {
                            await this.props.host.backend.revealChipDirectory(chip.id);
                          });

                          break;
                        }
                      }
                    }}
                    key={chip.id}>
                    <button type="button" className="clist-entrywide" onClick={() => {
                      this.props.setRoute(['chip', chip.id, 'settings']);
                    }}>
                      <div className="clist-header">
                        <div className="clist-title">{metadata.title}</div>
                      </div>
                      <dl className="clist-data">
                        <dt>Created</dt>
                        <dd><TimeSensitive child={() => <>{formatRelativeDate(metadata.creationDate)}</>} /></dd>
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
                {pastChips.map(({ chip, metadata }) => {
                  // console.log(chip)

                  switch (chip.condition) {
                    case ChipCondition.Ok:
                    case ChipCondition.Partial:
                    case ChipCondition.Unrunnable: return (
                      <DraftEntry
                        createMenu={() => [
                          { id: 'archive', name: 'Unarchive', icon: 'unarchive' },
                        ]}
                        disabled={false}
                        name={metadata!.title}
                        onSelect={(path) => {
                          switch (path.first()) {
                            case 'archive': {
                              this.pool.add(async () => {
                                await metadataTools.archiveChip!(this.props.host, chip, false);
                              });
                            }
                          }
                        }}
                        properties={[
                          { id: 'created', label: formatRelativeDate(metadata!.creationDate), icon: 'schedule' }
                        ]}
                        key={chip.id} />
                    );

                    case ChipCondition.Unsupported: return (
                      <DraftEntry
                        createMenu={() => [
                        ]}
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
