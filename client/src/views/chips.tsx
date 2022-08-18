import * as React from 'react';

import type { Route } from '../application';
import type { Host } from '../host';
import { ChipId } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
import { Icon } from '../components/icon';
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
    let chips = Object.values(this.props.host.state.chips);

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

        {(chips.length > 0)
          ? (
            <div className="clist-root">
              {chips.map((chip) => {
                let previewUrl: string | null = null;

                for (let unit of Object.values(this.props.host.units)) {
                  previewUrl ??= unit.providePreview?.({ chip, host: this.props.host }) ?? null;

                  if (previewUrl) {
                    break;
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
                        <div className="clist-title">{chip.metadata.name}</div>
                      </div>
                      <dl className="clist-data">
                        <dt>Created</dt>
                        <dd>{formatRelativeDate(chip.metadata.created_time * 1000)}</dd>
                        <dt>Owner</dt>
                        <dd>Bob</dd>
                        <dt>Chip model</dt>
                        <dd>Mitomi 768</dd>
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

        {/* <header className="header header--2">
          <h2>Archived chips</h2>
        </header>

        <div className="lproto-container">
          <div className="lproto-list">
            <button type="button" className="lproto-entry">
              <div className="lproto-label">PWM attempt number 3</div>
              <div className="lproto-property-list">
                <div className="lproto-property-item">
                  <Icon name="schedule" />
                  <div className="lproto-property-label">yesterday (14 hrs)</div>
                </div>
                <div className="lproto-property-item">
                  <Icon name="face" />
                  <div className="lproto-property-label">Bob</div>
                </div>
              </div>
              <div className="lproto-action-item">
                <Icon name="arrow_forward" />
              </div>
            </button>

            <button type="button" className="lproto-entry" disabled>
              <div className="lproto-label">[Corrupted chip]</div>
              <div className="lproto-property-list">
                <div className="lproto-property-item">
                  <Icon name="broken_image" />
                  <div className="lproto-property-label">Corrupted</div>
                </div>
                <div className="lproto-property-item">
                  <Icon name="weight" />
                  <div className="lproto-property-label">2.25 MB</div>
                </div>
              </div>
              <div className="lproto-action-item">
                <Icon name="arrow_forward" />
              </div>
            </button>
          </div>
        </div> */}
      </main>
    )
  }
}
