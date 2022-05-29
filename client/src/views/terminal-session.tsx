import * as React from 'react';
import * as Rf from 'retroflex';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import type { Host, Model } from '..';
import type { HostId } from '../backends/common';
import WebsocketBackend, { type TerminalSession } from '../backends/websocket';
import * as util from '../util';

import 'xterm/css/xterm.css';


interface ViewTerminalSessionState {
  selectedHostId: HostId | null;
}

export default class ViewTerminalSession extends React.Component<Rf.ViewProps<Model>, ViewTerminalSessionState> {
  fitAddon = new FitAddon();
  observer!: ResizeObserver;
  terminal = new Terminal({
    fontFamily: '"Menlo for Powerline"',
    fontSize: 12,
    // scrollback: 0
    theme: {
      background: '#003847',
      selection: '#0002',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#839496',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#859900',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#839496'
    }
  });
  refContainer = React.createRef<HTMLDivElement>();
  session: TerminalSession | null = null;
  sessionLoading = false;

  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      selectedHostId: null
    };

    this.terminal.loadAddon(this.fitAddon);


    let encoder = new TextEncoder();

    this.terminal.onData((data) => {
      if (this.session) {
        this.session.write(encoder.encode(data));
      } else if (this.host && !this.sessionLoading) {
        this.createSession();
      }
    });

    this.terminal.onSelectionChange(() => {
      let selection = this.terminal.getSelection();

      if (selection.length > 0) {
        let type = 'text/plain';
        let blob = new Blob([selection], { type });

        navigator.clipboard.write([
          new ClipboardItem({ [type]: blob })
        ]);
      }
    });
  }

  get host(): Host | null {
    return this.state.selectedHostId
      ? this.props.model.hosts[this.state.selectedHostId]
      : null;
  }

  componentDidMount() {
    let container = this.refContainer.current!;

    this.terminal.open(container);
    this.terminal.focus();
    this.fitAddon.fit();

    this.writeMessage('[No host selected]');

    let resize = util.debounce(200, () => {
      this.fitAddon.fit();

      if (this.session) {
        this.session.resize({
          columns: this.terminal.cols,
          rows: this.terminal.rows
        });
      }

      this.terminal.focus();
    });

    this.observer = new ResizeObserver((_entries) => {
      resize();
    });

    this.observer.observe(container);
  }

  componentDidUpdate() {
    if (this.host && !this.session) {
      this.createSession();
    }

    if (!this.state.selectedHostId && (Object.keys(this.props.model.hosts).length > 0)) {
      let host = Object.values(this.props.model.hosts)[0];
      console.log('Debug: selected', host.state.info.id);

      this.setState({
        selectedHostId: host.state.info.id
      });
    }
  }

  componentWillUnmount() {
    this.terminal.dispose();
    this.observer.disconnect();

    if (this.session) {
      this.session.close();
    }
  }

  async createSession() {
    await this.writeMessage('[Loading]');
    this.sessionLoading = true;

    let session = await (this.host!.backend as WebsocketBackend).createSession({
      size: { columns: this.terminal.cols, rows: this.terminal.rows }
    });

    this.session = session;
    this.sessionLoading = false;

    session.closed.finally(() => {
      this.session = null;
    });

    this.terminal.reset();
    this.terminal.write("\u{1b}[?25h"); // Show cursor
    this.terminal.focus();

    for await (let chunk of session) {
      this.terminal.write(chunk);
    }

    let { status } = await session.closed;
    await this.writeMessage(`[Session closed with status ${status}]`);
  }

  async writeMessage(message: string) {
    this.terminal.reset();

    let x = Math.max(Math.floor((this.terminal.cols - message.length) * 0.5), 1);
    let y = Math.max(Math.floor(this.terminal.rows * 0.5), 1);

    await new Promise<void>((resolve) => {
      this.terminal.write(`\u{1b}[${y};${x}H${message}\u{1b}[?25l`, () => {
        resolve();
      });
    });
  }

  render() {
    let host = this.host!;

    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root">
            <div className="toolbar-group">
              <Rf.Select
                selectedOptionPath={this.state.selectedHostId && [this.state.selectedHostId]}
                menu={[
                  { id: '_header', name: 'Hosts', type: 'header' },
                  ...Object.values(this.props.model.hosts).map((host) => ({
                    id: host.id,
                    name: host.state.info.name,
                    icon: 'storage'
                  })),
                  { id: '_divider', type: 'divider' },
                  { id: 'manage', name: 'Manage hosts' }
                ]}
                onSelect={([selectedHostId]) => {
                  this.setState({ selectedHostId: selectedHostId as HostId });
                }} />
            </div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          <div className="termsession" ref={this.refContainer} />
        </Rf.ViewBody>
      </>
    );
  }
}
