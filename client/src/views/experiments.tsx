import { Component } from 'react';
import seqOrd from 'seq-ord';

import viewStyles from '../../styles/components/view.module.scss';

import { ContextMenuArea } from '../components/context-menu-area';
import { TitleBar } from '../components/title-bar';
import { BaseUrl } from '../constants';
import { formatRelativeDate } from '../format';
import { ViewProps } from '../interfaces/view';
import * as util from '../util';
import { Pool } from '../util';


export class ViewExperiments extends Component<ViewProps> {
  pool = new Pool();

  override render() {
    let experiments = Object.values(this.props.host.state.experiments).sort(seqOrd(function* (a, b, rules) {
      yield rules.numeric(b.creationDate, a.creationDate);
      yield rules.text(a.title, b.title);
    }));

    return (
      <main className={viewStyles.root}>
        <TitleBar title="Experiments" />
        <div className={util.formatClass(viewStyles.contents, viewStyles.legacy)}>
          <header className="header header--1">
            <h1>Experiments</h1>
          </header>

          {/* <div className="header header--2">
            <h2>Active experiments</h2>
          </div> */}

          {(experiments.length > 0)
            ? (
              <div className="clist-root">
                {experiments.map((experiment) => {
                  return (
                    <ContextMenuArea
                      createMenu={(_event) => [
                        { id: 'reveal', name: 'Reveal in explorer', icon: 'folder_open' },
                        { id: 'delete', name: 'Move to trash', icon: 'delete' }
                      ]}
                      onSelect={(path) => {
                        let command = path.first();

                        switch (command) {
                          case 'delete':
                            this.pool.add(async () =>
                              void await this.props.host.client.request({
                                type: 'deleteExperiment',
                                experimentId: experiment.id,
                                trash: true
                              })
                            );
                            break;
                          case 'reveal':
                            this.pool.add(async () =>
                              void await this.props.host.client.request({
                                type: 'revealExperimentDirectory',
                                experimentId: experiment.id
                              })
                            );
                            break;
                        }
                      }}
                      key={experiment.id}>
                      <a href={`${BaseUrl}/experiment/${experiment.id}`} className="clist-entrywide">
                        <div className="clist-header">
                          <div className="clist-title">{experiment.title}</div>
                        </div>
                        <dl className="clist-data">
                          <dt>Created</dt>
                          <dd>{formatRelativeDate(experiment.creationDate)}</dd>
                          <dt>Protocol</dt>
                          <dd>{experiment.master?.protocol.name ?? 'Idle'}</dd>
                        </dl>
                      </a>
                    </ContextMenuArea>
                  );
                })}
              </div>
            )
            : (
              <div className="clist-blank">
                <p>No experiment</p>
              </div>
            )}
        </div>
      </main>
    )
  }


  static navigate() {
    return navigation.navigate(`${BaseUrl}/experiments`);
  }

  static routes = [
    { id: '_', pattern: '/experiments' }
  ];
}
