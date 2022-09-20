import * as React from 'react';
import seqOrd from 'seq-ord';
import Split from 'react-split-grid';

import { TitleBar } from '../../components/title-bar';
import * as util from '../../util';

import viewStyles from '../../../styles/components/view.module.scss';



export class ViewSplit extends React.Component<any, any> {
  refTitleBar = React.createRef<TitleBar>();

  constructor(props: any) {
    super(props);

    this.state = {
      dragging: false,
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
          <button type="button" className="btn" onClick={() => {
            this.refTitleBar.current?.notify();
          }}>Notify</button>
          <button type="button" className="btn" onClick={() => {
            this.setState({
              subtitle: 'Foo',
              subtitleVisible: !this.state.subtitleVisible
            });
          }}>Toggle subtitle visible</button>
          <button type="button" className="btn" onClick={() => {
            this.setState({
              subtitle: null,
              subtitleVisible: false
            });
          }}>Remove subtitle</button>
          <Split
            onDragStart={() => {
              this.setState({ dragging: true });
            }}
            onDragEnd={() => {
              this.setState({ dragging: false });
            }}
            snapOffset={20}
            render={({
              getGridProps,
              getGutterProps,
            }) => (
              <div className="grid" {...getGridProps()}>
                <div />
                <div className={util.formatClass({ '_dragging': this.state.dragging })} {...getGutterProps('column', 1)} />
                <div />
              </div>
            )}
          />
        </div>
      </main>
    );
  }
}
