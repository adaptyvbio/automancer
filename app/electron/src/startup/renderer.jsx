// import { ipcRenderer } from 'electron';
import { React, ReactDOM, Startup } from 'pr1-client';
// import * as React from '../../../client/node_modules/react';
// import { createRoot } from '../../../client/node_modules/react-dom/client';

import 'pr1-client/dist/index.css';


let root = ReactDOM.createRoot(document.getElementById('root'));


class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hostSettings: {}
    };
  }

  componentDidMount() {
    setTimeout(() => {
      window.api.ready();
    }, 200);

    window.api.getHostSettings().then((hostSettings) => {
      this.setState({ hostSettings });
    });
  }

  render() {
    return (
      <Startup
        createHostSettings={(options) => {
          console.log(options);
        }}
        hostSettings={this.state.hostSettings} />
    );
  }
}

root.render(<App />);
