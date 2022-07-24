import { BackendCommon, Chip, ChipId, ControlNamespace, HostState, ProtocolLocation } from './common';
import type { Draft } from '../draft';
import type { Codes } from '../units';


export abstract class RawMessageBackend extends BackendCommon {
  protected abstract _request(request: unknown): Promise<unknown>;


  async command(chipId: string, command: ControlNamespace.RunnerCommand) {
    await this._request({
      type: 'command',
      chipId,
      command
    });
  }

  async compileDraft(draftId: string, source: string) {
    return await this._request({
      type: 'compileDraft',
      draftId,
      source
    }) as NonNullable<Draft['compiled']>;
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

  async pause(chipId: string, options: { neutral: boolean; }) {
    await this._request({
      type: 'pause',
      chipId,
      options
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

  async setMatrix(chipId: ChipId, update: Partial<Chip['matrices']>) {
    await this._request({
      type: 'setMatrix',
      chipId,
      update
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
