import { BackendCommon, Chip, ChipId, ControlNamespace, HostState } from './common';


export default class WebsocketBackend extends BackendCommon {
  #socket!: WebSocket;
  state!: HostState;

  constructor() {
    super();
  }

  async start() {
    this.#socket = new WebSocket("ws://localhost:4567", "alpha");

    await new Promise<void>((resolve) => {
      this.#socket.addEventListener('open', () => {
        resolve();
      });
    });

    let controller = new AbortController();

    await new Promise<void>((resolve) => {
      this.#socket.addEventListener('message', (event) => {
        let data = JSON.parse(event.data);

        this.state = data;
        this._update();

        resolve();
      }, { signal: controller.signal });
    });

    controller.abort();

    this.#socket.addEventListener('message', (event) => {
      let data = JSON.parse(event.data);

      this.state = data;
      this._update();
    });

    // this.#socket.addEventListener('close', (event) => {
    //   if (event.code === 1006) {
    //     setTimeout(() => {
    //       this.start();
    //     }, 1000);
    //   }
    // });
  }

  async command(chipId: string, command: ControlNamespace.RunnerCommand) {
    this.#socket.send(JSON.stringify({
      type: 'command',
      chipId,
      command
    }));
  }

  async createChip(options: { modelId: string; }) {
    this.#socket.send(JSON.stringify({
      type: 'createChip',
      modelId: options.modelId
    }));
  }

  async createDraft(draftId: string, source: string) {
    this.#socket.send(JSON.stringify({
      type: 'createDraft',
      draftId,
      source
    }));
  }

  async deleteChip(chipId: ChipId) {
    this.#socket.send(JSON.stringify({
      type: 'deleteChip',
      chipId
    }));
  }

  async setMatrix(chipId: ChipId, update: Partial<Chip['matrices']>) {
    this.#socket.send(JSON.stringify({
      type: 'setMatrix',
      chipId,
      update
    }));
  }
}
