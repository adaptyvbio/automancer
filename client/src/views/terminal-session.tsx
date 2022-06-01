import * as React from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import type { Host, Route } from '../application';
import WebsocketBackend, { type TerminalSession } from '../backends/websocket';
import * as util from '../util';
import { Pool } from '../util';

import 'xterm/css/xterm.css';


interface ViewTerminalSessionProps {
  host: Host;
  setRoute(route: Route): void;
}

interface ViewTerminalSessionState {

}

export class ViewTerminalSession extends React.Component<ViewTerminalSessionProps, ViewTerminalSessionState> {
  fitAddon = new FitAddon();
  observer!: ResizeObserver;
  pool = new Pool();

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

  constructor(props: ViewTerminalSessionProps) {
    super(props);

    this.state = {

    };

    this.terminal.loadAddon(this.fitAddon);


    let encoder = new TextEncoder();

    this.terminal.onData((data) => {
      if (this.session) {
        this.session.write(encoder.encode(data));
      } else if (!this.sessionLoading) {
        this.createSession();
      }
    });

    this.terminal.onSelectionChange(() => {
      let selection = this.terminal.getSelection();

      if (selection.length > 0) {
        let type = 'text/plain';
        let blob = new Blob([selection], { type });

        this.pool.add(async () => {
          await navigator.clipboard.write([
            new ClipboardItem({ [type]: blob })
          ]);
        });
      }
    });
  }

  componentDidMount() {
    let container = this.refContainer.current!;

    this.terminal.open(container);
    this.terminal.focus();
    this.fitAddon.fit();

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

    this.createSession();
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

    let session = await (this.props.host.backend as WebsocketBackend).createSession({
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
    return (
      <div className="termsession-outer">
        <div className="termsession-inner" ref={this.refContainer} />
      </div>
    );
  }
}
