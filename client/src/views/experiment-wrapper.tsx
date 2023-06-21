import { ExperimentId } from 'pr1-shared';
import { Component } from 'react';
import { ViewExperiments } from './experiments';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { BaseUrl } from '../constants';
import { ViewExperiment } from './experiment';
import { ViewExecution } from './execution';


export interface ViewExperimentWrapperRoute {
  id: '_';
  params: {
    experimentId: ExperimentId;
  };
  state: void;
}


export type ViewExperimentWrapperProps = ViewProps<ViewExperimentWrapperRoute>;

export interface ViewExperimentWrapperState {

}

export class ViewExperimentWrapper extends Component<ViewExperimentWrapperProps, ViewExperimentWrapperState> {
  constructor(props: ViewExperimentWrapperProps) {
    super(props);

    this.state = {};
  }

  get experiment() {
    return this.props.host.state.experiments[this.props.route.params.experimentId];
  }

  componentDidRender() {
    if (!this.experiment) {
      ViewExperiments.navigate();
      return;
    }
  }

  override componentDidMount() {
    this.componentDidRender();
  }

  override componentDidUpdate() {
    this.componentDidRender();
  }

  override render() {
    if (!this.experiment) {
      return null;
    }

    return this.experiment.master
      ? <ViewExecution experiment={this.experiment} {...this.props} />
      : <ViewExperiment experiment={this.experiment} {...this.props} />;
  }


  static hash(options: ViewHashOptions<ViewExperimentWrapperRoute>) {
    return options.route.params.experimentId;
  }

  static navigate(experimentId: ExperimentId) {
    return navigation.navigate(`${BaseUrl}/experiment/${experimentId}`);
  }

  static routes = [
    { id: '_', pattern: '/experiment/:experimentId' }
  ];
}
