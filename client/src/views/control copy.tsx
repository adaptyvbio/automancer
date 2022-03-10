import * as React from 'react';

import * as Rf from 'retroflex';
import { Model } from '..';


interface ViewControlState {
  activeHostChipId: [string, string] | null;
}

export default class ViewControl extends React.Component<Rf.ViewProps<Model>, ViewControlState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      activeHostChipId: null
    };
  }

  render() {
    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root">
            <div className="toolbar-group">
              <Rf.Select
                activeEntryId={this.state.activeHostChipId?.join('.') ?? null}
                menu={
                  Object.entries(this.props.model.hosts).map(([id, host]) => ({
                    id,
                    name: host.state.name,
                    children: host.state.chips.map((chip, index) => ({
                      id: [id, index.toString()].join('.'),
                      icon: 'memory',
                      name: chip.name
                    }))
                  }))
                }
                onSelect={(id) => {
                  let [hostId, chipId] = id.split('.');
                  this.setState({ activeHostChipId: [hostId, chipId] });
                }} />
            </div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          <div className="mapper-root">
            <h2>Multiplexer</h2>
            <div className="mapper-list">
              <label className="mapper-mapping">
                <div className="mapper-source">Mult1</div>
                <div className="mapper-dest">Dest</div>
              </label>
              <label className="mapper-mapping">
                <div className="mapper-source">Mult2</div>
                <div className="mapper-dest">Dest</div>
              </label>
              <label className="mapper-mapping">
                <div className="mapper-source">Mult3</div>
                <div className="mapper-dest">Dest</div>
              </label>
            </div>
          </div>
        </Rf.ViewBody>
      </>
    )
  }
}
