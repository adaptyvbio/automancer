import { BackendCommon, Chip, ChipId, ControlNamespace, HostState, ProtocolLocation } from './common';
import type { Draft, DraftCompilation } from '../draft';
import type { Codes, UnitNamespace } from '../units';
import { DraftItem } from '../app-backends/base';


export abstract class RawMessageBackend extends BackendCommon {
  protected abstract _request(request: unknown): Promise<unknown>;


  async command<T>(options: { chipId: ChipId; command: T; namespace: UnitNamespace; }) {
    await this._request({
      type: 'command',
      chipId: options.chipId,
      command: options.command,
      namespace: options.namespace
    });
  }

  async compileDraft(options: {
    draftItem: DraftItem;
    skipAnalysis: boolean;
  }) {
    let files = (await options.draftItem.getFiles())!;
    let mainFile = files[options.draftItem.mainFilePath];
    let source = await mainFile.text();
    await new Promise(r=>setTimeout(r,500))

    return await this._request({
      type: 'compileDraft',
      draftId: options.draftItem.id,
      source
    }) as DraftCompilation;
  }

  async createChip() {
    return await this._request({
      type: 'createChip'
    }) as { chipId: ChipId; };
  }

  async deleteChip(chipId: ChipId) {
    await this._request({
      type: 'deleteChip',
      chipId
    });
  }

  async createDraftSample() {
    return await this._request({
      type: 'createDraftSample'
    }) as string;
  }

  async instruct<T>(instruction: T) {
    await this._request({
      type: 'instruct',
      instruction
    });
  }

  async pause(chipId: string, options: { neutral: boolean; }) {
    await this._request({
      type: 'pause',
      chipId,
      options
    });
  }

  async reloadUnits() {
    await this._request({
      type: 'reloadUnits'
    });
  }

  async resume(chipId: string) {
    await this._request({
      type: 'resume',
      chipId
    });
  }

  async setChipMetadata(chipId: string, value: Partial<{ description: string | null; name: string; }>): Promise<void> {
    await this._request({
      type: 'setChipMetadata',
      chipId,
      value
    });
  }

  async setLocation(chipId: string, location: ProtocolLocation) {
    await this._request({
      type: 'setLocation',
      chipId,
      location
    });
  }

  async skipSegment(chipId: ChipId, segmentIndex: number, processState?: object) {
    await this._request({
      type: 'skipSegment',
      chipId,
      processState: processState ?? null,
      segmentIndex
    });
  }

  async startPlan(options: {
    chipId: string;
    data: Codes;
    location: ProtocolLocation;
    source: string;
  }) {
    await this._request({
      type: 'startPlan',
      chipId: options.chipId,
      data: options.data,
      location: options.location,
      source: options.source
    });
  }
}
