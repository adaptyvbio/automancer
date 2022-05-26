import * as React from 'react';
import * as Rf from 'retroflex';

import type { Model } from '..';
import { ContextMenuArea } from '../components/context-menu-area';
import { Segments } from '../components/visual-editor';


export default class ViewSettings extends React.Component<Rf.ViewProps<Model>> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {};
  }

  render() {
    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root">
            <div className="toolbar-group"></div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          {/* <Segments app={this.props.app} /> */}
          <VisualEditor app={this.props.app} />
        </Rf.ViewBody>
      </>
    );
  }
}


export class VisualEditor extends React.Component<any, any> {
  constructor(props: any) {
    super(props);

    let a = () => ({
      id: crypto.randomUUID(),
      features: [
        { icon: 'memory', label: Math.floor(Math.random() * 10).toString() + ' Gb' },
        { icon: 'face', label: 'Bob' }
      ]
    });

    this.state = {
      segments: [a(), a(), a(), a()],
      steps: [
        { id: crypto.randomUUID(), name: 'Alpha', seq: [0, 3] },
        { id: crypto.randomUUID(), name: 'Beta', seq: [3, 4] },
      ]
    };
  }

  render() {
    return (
      <div className="protoview-root vedit-root">
        <div className="vedit-stage-root _open">
          <a href="#" className="vedit-stage-header">
            <Rf.Icon name="expand-more" />
            <h3 className="vedit-stage-name">Something</h3>
          </a>
          <div className="vedit-stage-steps">
          {this.state.steps.map((step) => (
            <ContextMenuArea key={step.id} onContextMenu={async (event) => {
              await this.props.app.showContextMenu(event, [
                { id: '_header', name: 'Protocol step', type: 'header' },
                { id: 'delete', name: 'Delete', shortcut: 'X' }
              ], (menuPath) => {

              });
            }}>
              <div className="vedit-step-item" key={step.id}>
                <div className="vedit-step-header">
                  <div className="vedit-step-time">00:00</div>
                  <div className="vedit-step-name">{step.name}</div>
                </div>
                <div className="vedit-segment-list">
                  <button type="button" className="vedit-segment-dropzone">
                    <div />
                    <div>
                      <Rf.Icon name="add-circle" />
                      <div>Add segment</div>
                    </div>
                    <div />
                  </button>

                  {new Array(step.seq[1] - step.seq[0]).fill(0).map((_, segmentRelIndex) => {
                    let segmentIndex = step.seq[0] + segmentRelIndex;
                    let segment = this.state.segments[segmentIndex];

                    return (
                      <React.Fragment key={segment.id}>
                        <ContextMenuArea onContextMenu={async (event) => {
                          event.stopPropagation();

                          await this.props.app.showContextMenu(event, [
                            { id: '_header', name: 'Protocol segment', type: 'header' },
                            { id: 'delete', name: 'Delete', shortcut: 'X' }
                          ], (menuPath) => {

                          });
                        }}>
                          <div className="vedit-segment-features" key={segment.id}>
                            {segment.features.map((feature, featureIndex) => (
                              <React.Fragment key={featureIndex}>
                                <Rf.Icon name={feature.icon} />
                                <span>{feature.label}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        </ContextMenuArea>

                        <button type="button" className="vedit-segment-dropzone">
                          <div />
                          <div>
                            <Rf.Icon name="add-circle" />
                            <div>Add segment</div>
                          </div>
                          <div />
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </ContextMenuArea>
          ))}
          </div>
        </div>
      </div>
    );
  }
}
