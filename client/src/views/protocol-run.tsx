import { Set as ImSet } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';
import { BlankState } from '../components/blank-state';
import type { Chip, ChipId, ChipModel, ControlNamespace, Draft, DraftId, HostId, Protocol } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
import SelectChip from '../components/select-chip';


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

              <Segments />
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
  return (
    <button type="button" className="segments-divider" style={{ gridRow: props.gridRow }} onClick={props.onTrigger}>
      <span></span>
      <span>
        <Rf.Icon name="add-circle" />
        <span>Add segment</span>
      </span>
      <span></span>
    </button>
  );
}


// class Segments extends React.Component<{}, { segments: { id: number; duration: number; }[]; }> {
//   ref = React.createRef<HTMLDivElement>();

//   constructor(props: {}) {
//     super(props);

//     this.state = {
//       segments: new Array(3).fill(0).map((_, index) => ({ id: index, duration: 10 * (index + 1) }))
//     };
//   }

//   componentDidMount() {

//   }

//   render() {
//     return (
//       <div className="segments-list" ref={this.ref}>
//         {this.state.segments.map((segment, segmentIndex) => (
//           <React.Fragment key={segment.id}>
//             <ContextMenuArea onContextMenu={async (event) => {
//               // await this.props.app.showContextMenu(event, [
//               //   { id: 'header', name: 'Protocol step', type: 'header' },
//               //   { id: 'notify', name: 'Add notification' }
//               // ], (menuPath) => {

//               // });
//             }}>
//               <div className="segments-segment" draggable
//                 onDragStart={(event) => {
//                   event.dataTransfer.setData('text/plain', segment.id.toString());
//                   // event.dataTransfer.dropEffect = "copy";
//                 }}
//                 onDragOver={(event) => {
//                   event.preventDefault();
//                 }}
//                 onDrop={(event) => {
//                   event.preventDefault();
//                   console.log(event.dataTransfer.getData('text/plain'));
//                 }}>
//               {/* style={{ gridRow: segmentIndex + 1 }}> */}
//                 <span><Rf.Icon name="hourglass-empty" /></span><span>{segment.duration} min</span>
//                 <span><Rf.Icon name="air" /></span><span>Biotin BSA</span>
//               </div>
//             </ContextMenuArea>
//             {/* <SegmentsDivider gridRow={segmentIndex + 1} /> */}
//           </React.Fragment>
//         ))}
//         {/* <SegmentsDivider gridRow={segments.length} /> */}
//       </div>
//     );
//   }
// }



function Segments(props: {}) {
  let segments = new Array(3).fill(0);

  return (
    <div className="segments-list">
      {segments.map((_, segmentIndex) => (
        <React.Fragment key={segmentIndex}>
          <ContextMenuArea onContextMenu={async (event) => {
            // await this.props.app.showContextMenu(event, [
            //   { id: 'header', name: 'Protocol step', type: 'header' },
            //   { id: 'notify', name: 'Add notification' }
            // ], (menuPath) => {

            // });
          }}>
            <div className="segments-segment" style={{ gridRow: segmentIndex + 1 }}>
              <span><Rf.Icon name="hourglass-empty" /></span><span>20 min</span>
              <span><Rf.Icon name="air" /></span><span>Biotin BSA</span>
            </div>
          </ContextMenuArea>
          <SegmentsDivider gridRow={segmentIndex + 1} />
        </React.Fragment>
      ))}
      <SegmentsDivider gridRow={segments.length} />
    </div>
  );
}
