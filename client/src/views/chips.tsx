import * as React from 'react';

import type { Host, Route } from '../application';
import { Pool } from '../util';


export interface ViewChipsProps {
  host: Host;
  onRouteChange(route: Route): void;
}

export class ViewChips extends React.Component<ViewChipsProps> {
  pool = new Pool();

  render() {
    let chips = Object.values(this.props.host.state.chips);

    return (
      <main>
        <h1>Chips</h1>

        <div className="header2">
          <h2>Current chips</h2>
        </div>

        {(chips.length > 0)
          ? (
            <div className="card-list">
            {/* <button type="button" className="card-item">
              <div className="card-image">
                <img src="chip-preview.png" />
              </div>
              <div className="card-body">
                <div className="card-title">A.56</div>
                <p>Added on May 31st</p>
              </div>
            </button>
            <button type="button" className="card-item">
              <div className="card-image">
                <img src="chip-preview.png" />
              </div>
              <div className="card-body">
                <div className="card-title">Mitomi 1024</div>
              </div>
            </button> */}
            {chips.map((chip) => {
              let model = this.props.host.state.models[chip.modelId];

              return (
                <button type="button" className="card-item" key={chip.id} onClick={() => {
                  this.props.onRouteChange(['chip', chip.id]);
                }}>
                  <div className="card-image">
                    <img src="chip-preview.png" />
                  </div>
                  <div className="card-body">
                    <div className="card-title">{chip.name} ({model.name})</div>
                  </div>
                </button>
              );
            })}
            </div>
          )
          : (
            <div className="card-blank">
              <p>No chip running</p>
            </div>
          )}


        <header className="header2">
          <h2>Add a chip</h2>
          <button type="button" className="btn">
            <div>Manage models</div>
          </button>
        </header>

        <div className="card-list">
          {Object.values(this.props.host.state.models).map((model) => (
            <button type="button" className="card-item" key={model.id} onClick={() => {
              this.pool.add(async () => {
                let result = await this.props.host.backend.createChip({ modelId: model.id });
                // TODO: redirect to the ['chip', result.chipId] route
              });
            }}>
              <div className="card-image">
                <img src="chip-preview.png" />
              </div>
              <div className="card-body">
                <div className="card-title">{model.name}</div>
              </div>
            </button>
          ))}
          {/* <button type="button" className="card-item">
            <div className="card-image">
              <img src="chip-preview.png" />
            </div>
            <div className="card-body">
              <div className="card-title">Mitomi 1024</div>
            </div>
          </button>
          <button type="button" className="card-item">
            <div className="card-image">
              <img src="chip-preview.png" />
            </div>
            <div className="card-body">
              <div className="card-title">Mitomi 1024</div>
            </div>
          </button> */}
        </div>

        {/* + Completed chips */}
      </main>
    );
  }
}
