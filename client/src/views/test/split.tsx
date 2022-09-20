import * as React from 'react';
import seqOrd from 'seq-ord';

import { TitleBar } from '../../components/title-bar';

import viewStyles from '../../../styles/components/view.module.scss';



export class ViewSplit extends React.Component<any, any> {
  refTitleBar = React.createRef<TitleBar>();

  constructor(props: any) {
    super(props);

    this.state = {
      subtitle: null,
      subtitleVisible: false
    };
  }

  render() {
    return (
      <main className={viewStyles.root}>
        <TitleBar
          title="Split"
          subtitle={this.state.subtitle}
          subtitleVisible={this.state.subtitleVisible}
          ref={this.refTitleBar} />

        <div className={viewStyles.contents}>
          <button type="button" onClick={() => {
            this.refTitleBar.current?.notify();
          }}>Notify</button>
          <button type="button" onClick={() => {
            this.setState({
              subtitle: this.state.subtitleVisible ? null : 'Foox',
              subtitleVisible: !this.state.subtitleVisible
            });
          }}>Toggle subtitle visible</button>
        </div>
      </main>
    );
  }
}
