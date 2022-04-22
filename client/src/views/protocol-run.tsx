import { Set as ImSet } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';
import { BlankState } from '../components/blank-state';
import type { Chip, ChipId, ChipModel, ControlNamespace, Draft, DraftId, HostId, Protocol } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
import SelectChip from '../components/select-chip';
import * as util from '../util';
import { Application } from 'retroflex';


interface ViewProtocolRunState {
  selectedHostChipId: [HostId, ChipId] | null;
}

export default class ViewProtocolRun extends React.Component<Rf.ViewProps<Model>, ViewProtocolRunState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      selectedHostChipId: null
    };
  }

  render() {
    let host = this.state.selectedHostChipId && this.props.model.hosts[this.state.selectedHostChipId[0]];
    let chip = this.state.selectedHostChipId && host!.state.chips[this.state.selectedHostChipId[1]];

    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root" />
          <div className="toolbar-root">
            <div className="toolbar-group">
              <SelectChip
                filterChip={(chip) => chip.master}
                hosts={this.props.model.hosts}
                onSelect={(selectedHostChipId) => {
                  this.setState({ selectedHostChipId });
                }}
                selected={this.state.selectedHostChipId} />
            </div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          <div className="protocol-root">
            <div className="status-root">
              <div className="status-subtitle">Current step</div>
              <div className="status-header">
                <h2 className="status-title">Flow Neutravidin</h2>
                <div className="status-time">14:14 – 14:38 &middot; 20 min</div>
              </div>
              {/* <div className="status-list">
                <div className="status-segment">
                  <span><Rf.Icon name="hourglass-empty" /></span><span>20 min</span>
                  <span><Rf.Icon name="air" /></span><span>Biotin BSA</span>
                </div>
                <div className="status-segment">
                  <span><Rf.Icon name="hourglass-empty" /></span><span>20 min</span>
                  <span><Rf.Icon name="air" /></span><span>Biotin BSA</span>
                </div>
              </div> */}
              {/* <div className="status-list">
                <div className="status-segment">
                  <span><Rf.Icon name="hourglass-empty" /></span><span>20 min</span>
                  <span><Rf.Icon name="air" /></span><span>Biotin BSA</span>
                  <span><Rf.Icon name="announcement" /></span><span>Biotin BSA</span>
                  <span><Rf.Icon name="touch-app" /></span><span>Confirm</span>
                  <span>⎈</span><span>Multiplexer<sup>+</sup></span>
                </div>
                <div className="status-segment">
                  <span>⁂</span><span>Button</span>
                  <span>↬</span><span>Pump 200 µl</span>
                  <span>⌘</span><span>Confirm action</span>
                  <span>⧖</span><span>Wait 6 min</span>
                  <span>✱</span><span>Notify</span>
                </div>
              </div> */}

              <Segments app={this.props.app} />
            </div>
          </div>

          {/* {chip
            ? <div />
            : <BlankState message="No chip selected" />} */}
        </Rf.ViewBody>
      </>
    );
  }
}


function SegmentsDivider(props: {
  gridRow: number;
  onTrigger?(): void;
}) {
  let [over, setOver] = React.useState(false);

  return (
    <button type="button" className={util.formatClass('segments-divider', { '_over': over })} style={{ gridRow: props.gridRow }} onClick={props.onTrigger}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDragEnter={(event) => {
        // if (event.target === event.currentTarget) {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(true);
          console.log('Enter', event);
        }
      }}
      onDragLeave={(event) => {
        // if (event.target === event.currentTarget) {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(false);
          console.log('Leave', event);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        console.log('Drop from', event.dataTransfer.getData('text/plain'));
      }}>
      <span></span>
      <span>
        <Rf.Icon name="add-circle" />
        <span>Add segment</span>
      </span>
      <span></span>
    </button>
  );
}


function SegmentsDropzone(props: {
  // onTrigger?(): void;
  onDrop(data: string): void;
}) {
  let [over, setOver] = React.useState(false);

  return (
    <div className={util.formatClass('segments-dropzone', { '_over': over })}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDragEnter={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();

        setOver(false);
        props.onDrop(event.dataTransfer.getData('text/plain'));
        // console.log('Drop from', event.dataTransfer.getData('text/plain'));
      }}>
        <div></div>
      </div>
  );
}


type SegmentId = number;

interface SegmentsProps {
  app: Application;
}

interface SegmentsState {
  draggingSegmentId: SegmentId | null;
  segments: { id: SegmentId; duration: number; }[];
  selectedSegmentIds: ImSet<SegmentId>;
}

class Segments extends React.Component<SegmentsProps, SegmentsState> {
  ref = React.createRef<HTMLDivElement>();

  constructor(props: SegmentsProps) {
    super(props);

    this.state = {
      draggingSegmentId: null,
      segments: new Array(4).fill(0).map((_, index) => ({ id: index, duration: 10 * (index + 1) })),
      selectedSegmentIds: ImSet()
    };
  }

  moveSelected(insertionIndex: number) {
    this.setState((state) => {
      let movedSegments = state.segments.filter((segment) => state.selectedSegmentIds.has(segment.id));
      let actualInsertionIndex = 0;

      let otherSegments = state.segments.filter((segment, segmentIndex) => {
        let other = !state.selectedSegmentIds.has(segment.id);

        if (other && (segmentIndex < insertionIndex)) {
          actualInsertionIndex += 1;
        }

        return other;
      });

      return {
        segments: [
          ...otherSegments.slice(0, actualInsertionIndex),
          ...movedSegments,
          ...otherSegments.slice(actualInsertionIndex)
        ]
      };
    });
  }

  render() {
    return (
      <div className="segments-list" ref={this.ref}>
        <SegmentsDropzone onDrop={() => {
          this.moveSelected(0);
        }} />
        {this.state.segments.map((segment, segmentIndex) => (
          <React.Fragment key={segment.id}>
            <ContextMenuArea onContextMenu={async (event) => {
              let targets = this.state.selectedSegmentIds.has(segment.id)
                ? this.state.selectedSegmentIds
                : [segment.id];

              return this.props.app.showContextMenu(event, [
                { id: '_header', name: 'Protocol step', type: 'header' },
                { id: 'delete', name: 'Delete', shortcut: 'X' }
              ], (menuPath) => {

              });
            }}>
              <div className={util.formatClass('segments-entry', {
                '_dragging': /* (this.state.draggingSegmentId === segment.id) || */ ((this.state.draggingSegmentId !== null) && this.state.selectedSegmentIds.has(segment.id)),
                '_selected': this.state.selectedSegmentIds.includes(segment.id)
              })}>
                <div
                  className="segments-features"
                  draggable
                  tabIndex={-1}
                  onBlur={(event) => {
                    if (!event.currentTarget.parentElement!.parentElement!.contains(event.relatedTarget)) {
                      this.setState((state) => ({
                        selectedSegmentIds: state.selectedSegmentIds.clear()
                      }));
                    }
                  }}
                  onKeyDown={(event) => {
                    switch (event.key) {
                      case 'Backspace': {
                        this.setState((state) => ({
                          segments: state.segments.filter((segment) => !state.selectedSegmentIds.has(segment.id)),
                          selectedSegmentIds: state.selectedSegmentIds.clear()
                        }));

                        break;
                      }

                      case 'Escape': {
                        this.setState((state) => ({
                          selectedSegmentIds: state.selectedSegmentIds.clear()
                        }));

                        break;
                      }

                      default: return;
                    }

                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    // this.setState({ selectedSegmentIds: ImSet([segment.id]) });
                    this.setState((state) => {
                      if (event.metaKey) {
                        return { selectedSegmentIds: util.toggleSet(state.selectedSegmentIds, segment.id) };
                      } else {
                        return { selectedSegmentIds: ImSet([segment.id]) };
                      }
                    });
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', JSON.stringify({ sourceId: segment.id.toString() }));
                    // this.setState({ draggingSegmentId: segment.id });
                    // event.dataTransfer.dropEffect = "copy";

                    this.setState((state) => ({
                      draggingSegmentId: segment.id,
                      selectedSegmentIds: state.selectedSegmentIds.has(segment.id)
                        ? state.selectedSegmentIds
                        : ImSet([segment.id])
                    }));
                  }}
                  onDragEnd={() => {
                    this.setState({ draggingSegmentId: null });
                  }}>
                  {/* onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  console.log(event.dataTransfer.getData('text/plain'));
                }}> */}
                  {/* style={{ gridRow: segmentIndex + 1 }}> */}
                  <span><Rf.Icon name="hourglass-empty" /></span><span>{segment.duration} min</span>
                  <span><Rf.Icon name="air" /></span><span>Biotin BSA</span>
                </div>
              </div>
            </ContextMenuArea>
            <SegmentsDropzone onDrop={() => {
              this.moveSelected(segmentIndex + 1);
            }} />
            {/* <SegmentsDivider gridRow={segmentIndex + 1} /> */}
          </React.Fragment>
        ))}
        {/* <SegmentsDivider gridRow={segments.length} /> */}
      </div>
    );
  }
}
