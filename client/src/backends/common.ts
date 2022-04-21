export abstract class BackendCommon {
  private _listeners: Set<() => void> = new Set();

  onUpdate(listener: () => void, options?: { signal?: AbortSignal; }) {
    this._listeners.add(listener);

    options?.signal?.addEventListener('abort', () => {
      this._listeners.delete(listener);
    });
  }

  protected _update() {
    for (let listener of this._listeners) {
      listener();
    }
  }

  abstract command(chipId: ChipId, command: RunnerCommand): Promise<void>;
  abstract createChip(options: { modelId: ChipModelId; }): Promise<void>;
  abstract createDraft(draftId: string, source: string): Promise<void>;
  abstract deleteChip(chipId: ChipId): Promise<void>;
  abstract setMatrix(chipId: ChipId, update: Partial<Chip['matrices']>): Promise<void>;
}


export type ChipId = string;
export type ChipModelId = string;
export type DeviceId = string;
export type DraftId = string;
export type HostId = string;

export interface Device {
  id: DeviceId;
  name: string;
}

export interface Chip {
  id: ChipId;
  matrices: {
    control: ControlNamespace.Matrix;
  };
  modelId: ChipModelId;
  name: string;
  runners: {
    control: ControlNamespace.Runner;
  };
}

export interface ChipModel {
  id: ChipModelId;
  name: string;
  sheets: {
    control: ControlNamespace.Sheet;
  };
}

export interface Draft {
  id: DraftId;
  errors: {
    message: string;
    range: [number, number];
  }[];
  protocol: Protocol | null;
  source: string;
}


export interface Protocol {
  name: string;
  segments: ProtocolSegment[];
  stages: ProtocolStage[];
  data: {
    control?: ControlNamespace.ProtocolData;
  }
}

export interface ProtocolStage {
  name: string;
  seq: ProtocolSeq;
  steps: ProtocolStep[];
}

export interface ProtocolStep {
  name: string;
  seq: ProtocolSeq;
}

export interface ProtocolSegment {
  processNamespace: Namespace;
  data: {
    control?: ControlNamespace.SegmentData;
    input?: InputNamespace.SegmentData;
    timer?: TimerNamespace.SegmentData;
  };
}

export type ProtocolSeq = [number, number];


export interface HostState {
  info: {
    id: HostId;
    name: string;
    startTime: number;
  };

  chips: Record<ChipId, Chip>;
  drafts: Record<DraftId, Draft>;
  models: Record<ChipModelId, ChipModel>;
  devices: Device[];

  executors: {
    control: ControlNamespace.ExecutorState;
  };
}

export type Namespace = 'control' | 'input' | 'timer';
export type RunnerCommand = ControlNamespace.RunnerCommand;


export namespace ControlNamespace {
  export type Signal = string;

  export interface ExecutorState {
    valves: Record<string, number>;
  }

  export interface Matrix {
    valves: {
      aliases: string[];
      hostValveIndex: number;
    }[];
  }

  export interface Runner {
    signal: Signal;
    valves: {
      error: RunnerValveError | null;
    }[];
  }

  export interface Sheet {
    groups: {
      color: string;
      name: string;
    }[];

    valves: {
      group: number;
      names: string[];
      schematic: [number, number] | null;
    }[];

    schematic: string | null;
  }

  export enum RunnerValveError {
    Unbound = 0,
    Unresponsive = 1
  }

  export interface RunnerCommand {
    control: {
      type: 'signal';
      signal: Signal;
    };
  }

  export interface ProtocolData {
    parameters: { label: string; }[];
  }

  export interface SegmentData {
    valves: number[];
  }
}


export namespace InputNamespace {
  export interface SegmentData {
    message: string;
  }
}


export namespace TimerNamespace {
  export interface SegmentData {
    duration: number;
  }
}
