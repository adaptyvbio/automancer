import { Experiment, ExperimentId, ExperimentReportHeader, Protocol, ProtocolBlockPath } from 'pr1-shared';
import { Component } from 'react';

import editorStyles from '../../styles/components/editor.module.scss';
import viewStyles from '../../styles/components/view.module.scss';

import { ViewHashOptions, ViewProps, ViewRouteMatch } from '../interfaces/view';
import { BaseUrl } from '../constants';
import { formatClass } from '../util';
import { TitleBar } from '../components/title-bar';
import { ViewExperiments } from './experiments';
import { ViewExperimentWrapperRoute } from './experiment-wrapper';
import { SplitPanels } from '../components/split-panels';
import { ErrorBoundary } from '../components/error-boundary';
import { GraphEditor } from '../components/graph-editor';
import { BlockInspector } from '../components/block-inspector';
import { TabNav } from '../components/tab-nav';


export type ViewExperimentProps = ViewProps<ViewExperimentWrapperRoute> & { experiment: Experiment; };

export interface ViewExperimentState {
  reportHeader: ExperimentReportHeader | null;
  selectedBlockPath: ProtocolBlockPath | null;
}

export class ViewExperiment extends Component<ViewExperimentProps, ViewExperimentState> {
  constructor(props: ViewExperimentProps) {
    super(props);

    this.state = {
      reportHeader: null,
      selectedBlockPath: null
    };
  }

  override componentDidMount() {
    this.props.app.pool.add(async () => {
      let reportHeader = await this.props.host.client.request({
        type: 'getExperimentReportHeader',
        experimentId: this.props.experiment.id
      });

      this.setState({ reportHeader });
    });
  }

  override render() {
    if (!this.state.reportHeader) {
      return null;
    }

    let protocol: Protocol = {
      name: this.state.reportHeader.name,
      root: this.state.reportHeader.root
    };

    return (
      <main className={viewStyles.root}>
        <TitleBar title={this.props.experiment.title ?? '[Untitled]'} />
        <div className={formatClass(viewStyles.contents)}>
          <SplitPanels
            panels={[
              {
                component: (
                  <ErrorBoundary>
                    <GraphEditor
                      app={this.props.app}
                      host={this.props.host}
                      protocolRoot={this.state.reportHeader.root}
                      selectBlock={(selectedBlockPath) => void this.setState({ selectedBlockPath })}
                      selection={this.state.selectedBlockPath && {
                        blockPath: this.state.selectedBlockPath,
                        observed: false
                      }} />
                  </ErrorBoundary>
                )
              },
              {
                component: (
                  <TabNav entries={[
                    {
                      id: 'inspector',
                      label: 'Inspector',
                      shortcut: 'I',
                      contents: () => (
                        <ErrorBoundary>
                          <BlockInspector
                            app={this.props.app}
                            blockPath={this.state.selectedBlockPath}
                            host={this.props.host}
                            protocol={protocol}
                            selectBlock={(selectedBlockPath) => void this.setState({ selectedBlockPath })} />
                        </ErrorBoundary>
                      )
                    }
                  ]} />
                )
              }
            ]} />
        </div>
      </main>
    );
  }
}
