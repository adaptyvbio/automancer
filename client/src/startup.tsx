import '@fontsource/space-mono';
import * as React from 'react';


export class Startup extends React.Component {
  render() {
    return (
      <div className="startup-container">
        <div className="startup-root">
          <div className="startup-left-root">
            <div className="startup-left-header">
              <div className="startup-left-logo">
                <div className="startup-left-logo-inner"></div>
              </div>
              <div className="startup-left-title">PR–1</div>
            </div>
            <div className="startup-left-bar">
              <div>Version 1.6 (110)</div>
              <button type="button" className="startup-left-action">
                <div>Use local host</div>
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" /></svg>
              </button>
            </div>
          </div>
          <div className="startup-right-root">
            <div className="startup-right-entry-list">
              <button type="button" className="startup-right-entry-item">
                <div className="startup-right-entry-title">Cell-free mitomi</div>
                <div className="startup-right-entry-path">protocols/cell-free.yml</div>
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" /></svg>
              </button>
              <button type="button" className="startup-right-entry-item">
                <div className="startup-right-entry-title">Cell-free mitomi</div>
                <div className="startup-right-entry-path">protocols/cell-free.yml</div>
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" /></svg>
              </button>
              <button type="button" className="startup-right-entry-item">
                <div className="startup-right-entry-title">Cell-free mitomi</div>
                <div className="startup-right-entry-path">protocols/cell-free.yml</div>
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" /></svg>
              </button>
            </div>
            <div className="startup-right-entry-list">
              <button type="button" className="startup-right-entry-item">
                <div className="startup-right-entry-title">Connect to new host</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
