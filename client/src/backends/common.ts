import type { UnitsCode } from '../units';


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
  abstract startPlan(options: {
    chipId: ChipId;
    data: UnitsCode;
    draftId: DraftId;
    // position: {
    //   progress: number;
    //   segmentIndex: number;
    // } | null
  }): Promise<void>;
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
  master: Master | null;
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


export interface Master {
  entries: MasterEntry[];
  protocol: Protocol;
}

export interface MasterEntry {
  error: string | null;
  paused: boolean;
  processState: { progress: number; };
  segmentIndex: number;
  time: number;
}


export interface Protocol {
  name: string | null;
  modelIds: ChipModelId[] | null;
  segments: ProtocolSegment[];
  stages: ProtocolStage[];
  data: {
    control?: ControlNamespace.ProtocolData;
  };
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
  devices: Record<DeviceId, Device>;

  executors: {
    control: ControlNamespace.ExecutorState;
  };
}

export type Namespace = 'control' | 'input' | 'timer';
export type RunnerCommand = ControlNamespace.RunnerCommand;


export namespace ControlNamespace {
  export type Signal = string;

  export interface Code {
    arguments: (number | null)[];
  }

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
    diagram: string | null;

    groups: {
      name: string;
    }[];

    valves: {
      diagramRef: [number, number] | null;
      group: number;
      names: string[];
    }[];
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
    parameters: {
      defaultValveIndices: Record<ChipId, number> | null;
      display: ('delta' | 'hidden' | 'visible') | null;
      label: string;
      repr: ('flow' | 'push' | 'unpush' | 'waves') | null;
    }[];
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
