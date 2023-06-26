import { Experiment, ExperimentId, ExperimentReportEventIndex, ExperimentReportInfo, Protocol, ProtocolBlockPath } from 'pr1-shared';
import hash from 'object-hash';
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
import { ReportInspector } from '../components/report-inspector';
import { ReportPanel } from '../components/report-panel';


export type ViewExperimentProps = ViewProps<ViewExperimentWrapperRoute> & { experiment: Experiment; };

export interface ViewExperimentState {
  reportInfo: ExperimentReportInfo | null;
  selectedBlockPath: ProtocolBlockPath | null;
}

export class ViewExperiment extends Component<ViewExperimentProps, ViewExperimentState> {
  constructor(props: ViewExperimentProps) {
    super(props);

    this.state = {
      reportInfo: null,
      selectedBlockPath: null
    };
  }

  override componentDidMount() {
    this.props.app.pool.add(async () => {
      let reportInfo = await this.props.host.client.request({
        type: 'getExperimentReportInfo',
        experimentId: this.props.experiment.id
      });

      this.setState({ reportInfo });
    });
  }

  override render() {
    if (!this.state.reportInfo) {
      return null;
    }

    let protocol: Protocol = {
      name: this.state.reportInfo.name,
      root: this.state.reportInfo.root
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
                      protocolRoot={this.state.reportInfo.root}
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
                      contents: () => (
                        <ErrorBoundary>
                          <ReportInspector
                            app={this.props.app}
                            blockPath={this.state.selectedBlockPath}
                            host={this.props.host}
                            experiment={this.props.experiment}
                            protocol={protocol}
                            reportInfo={this.state.reportInfo!}
                            selectBlock={(selectedBlockPath) => void this.setState({ selectedBlockPath })}
                            key={hash(this.state.selectedBlockPath)} />
                        </ErrorBoundary>
                      )
                    },
                    {
                      id: 'report',
                      label: 'Report',
                      contents: () => (
                        <ErrorBoundary>
                          <ReportPanel
                            compilationAnalysis={this.state.reportInfo!.initialAnalysis}
                            masterAnalysis={this.state.reportInfo!.masterAnalysis} />
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
