import ModernWebsocket from 'modern-websocket';
import { ClientBackend, ClientProtocol, deserializeMessagesOfIterator, serializeMessage, ServerProtocol } from 'pr1-shared';


export class WebsocketBackend implements ClientBackend {
  closed: Promise<void>;
  messages: AsyncIterator<ServerProtocol.Message>;
  ready: Promise<void>;

  private socket: ModernWebsocket;

  constructor(url: string) {
    this.socket = new ModernWebsocket(url);

    this.closed = this.socket.closed.then(() => {});
    this.ready = this.socket.ready;

    this.messages = deserializeMessagesOfIterator(this.socket.iter<string>());
  }

  close() {
    this.socket.close();
  }

  send(message: ClientProtocol.Message) {
    this.socket.send(serializeMessage(message));
  }
}
