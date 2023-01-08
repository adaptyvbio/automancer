import * as React from 'react';
import seqOrd from 'seq-ord';

import { DraftEntry } from './protocols';
import type { Host } from '../host';
import { Chip, ChipCondition, ChipId } from '../backends/common';
import { MenuEntry } from '../components/context-menu';
import { ContextMenuArea } from '../components/context-menu-area';
import { Icon } from '../components/icon';
import { TitleBar } from '../components/title-bar';
import { Pool } from '../util';
import { formatRelativeDate } from '../format';
import * as util from '../util';
import { MetadataTools } from '../unit';
import { ViewProps } from '../interfaces/view';

import viewStyles from '../../styles/components/view.module.scss';
import { BaseUrl } from '../constants';


export class ViewChips extends React.Component<ViewProps> {
  pool = new Pool();
  chipIdAwaitingRedirect: ChipId | null = null;

  componentDidUpdate() {
    if (this.chipIdAwaitingRedirect && (this.chipIdAwaitingRedirect in this.props.host.state.chips)) {
      navigation.navigate(`${BaseUrl}/chip/${this.chipIdAwaitingRedirect}`);
    }
  }

  render() {
    let metadataTools = this.props.host.units.metadata as unknown as MetadataTools;

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
      <main className={viewStyles.root}>
        <TitleBar title="Experiments" />
        <div className={util.formatClass(viewStyles.contents, viewStyles.legacy)}>
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

                  let status = (() => {
                    switch (chip.condition) {
                      case ChipCondition.Partial:
                        return { icon: 'report', modifier: 'info' };
                      case ChipCondition.Unrunnable:
                        return { icon: 'error', modifier: 'warning' };
                      default:
                        return null;
                    }
                  })();

                  return (
                    <ContextMenuArea
                      createMenu={(_event) => [
                        { id: 'duplicate_template', name: 'Use as template', icon: 'content_copy' },
                        { id: 'archive', name: 'Archive', icon: 'archive' },
                        { id: '_divider', type: 'divider' },
                        ...(status
                          ? [
                            { id: 'upgrade', name: 'Upgrade', icon: 'upgrade' },
                            { id: 'duplicate_upgrade', name: 'Upgrade copy', icon: 'control_point_duplicate' },
                            { id: '_divider2', type: 'divider' as const }
                          ]
                          : []),
                        { id: 'reveal', name: 'Reveal in explorer', icon: 'folder_open' },
                        { id: 'delete', name: 'Move to trash', icon: 'delete' }
                      ]}
                      onSelect={(path) => {
                        let command = path.first();

                        switch (command) {
                          case 'archive':
                            this.pool.add(async () => void await metadataTools.archiveChip!(this.props.host, chip, true));
                            break;
                          case 'delete':
                            this.pool.add(async () => void await this.props.host.backend.deleteChip(chip.id, { trash: true }));
                            break;
                          case 'duplicate_template':
                          case 'duplicate_upgrade':
                            this.pool.add(async () => void await this.props.host.backend.duplicateChip(chip.id, { template: (command === 'duplicate_template') }));
                            break;
                          case 'reveal':
                            this.pool.add(async () => void await this.props.host.backend.revealChipDirectory(chip.id));
                            break;
                          case 'upgrade':
                            this.pool.add(async () => void await this.props.host.backend.upgradeChip(chip.id));
                            break;
                        }
                      }}
                      key={chip.id}>
                      <a href={`${BaseUrl}/chip/${chip.id}`} className="clist-entrywide" title={chip.issues.map((issue) => issue.message).join(String.fromCharCode(10))}>
                        <div className="clist-header">
                          <div className="clist-title">{metadata.title}</div>
                          {status && (
                            <div className={`clist-status clist-status--${status.modifier}`}>
                              <Icon name={status.icon} style="sharp" />
                            </div>
                          )}
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
                      </a>
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
                      return (
                        <DraftEntry
                          createMenu={() => [
                            ...(chip.readable
                              ? [
                                { id: 'duplicate', name: 'Use as template', icon: 'content_copy' },
                                { id: 'archive', name: 'Unarchive', icon: 'unarchive' },
                                { id: '_divider', type: 'divider' as const }
                              ]
                              : []),
                            { id: 'reveal', name: 'Reveal in explorer', icon: 'folder_open' },
                            { id: 'delete', name: 'Move to trash', icon: 'delete' }
                          ]}
                          disabled={!chip.readable}
                          name={metadata?.title ?? ((chip.condition === ChipCondition.Unsupported) ? '[Unsupported]' : '[Corrupted]')}
                          onSelect={(path) => {
                            switch (path.first()) {
                              case 'archive':
                                this.pool.add(async () => void await metadataTools.archiveChip!(this.props.host, chip as Chip, false));
                                break;
                              case 'delete':
                                this.pool.add(async () => void await this.props.host.backend.deleteChip(chip.id, { trash: true }));
                                break;
                              case 'duplicate':
                                this.pool.add(async () => void await this.props.host.backend.duplicateChip(chip.id, { template: true }));
                                break;
                              case 'reveal':
                                this.pool.add(async () => void await this.props.host.backend.revealChipDirectory(chip.id));
                                break;
                            }
                          }}
                          properties={[
                            ...(metadata
                              ? [{ id: 'created', label: formatRelativeDate(metadata!.creationDate), icon: 'schedule' }]
                              : [{ id: 'corrupted', label: 'Unreadable', icon: 'broken_image' }])
                          ]}
                          key={chip.id} />
                      );
                    })}
                  </div>
              </div>
            </>
          )}
        </div>
      </main>
    )
  }


  static routes = [
    { id: 'chips', pattern: '/chip' }
  ];
}
