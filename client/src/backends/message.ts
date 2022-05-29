import { BackendCommon, Chip, ChipId, ControlNamespace } from './common';
import type { UnitsCode } from '../units';


export abstract class MessageBackend extends BackendCommon {
  protected abstract _request(message: unknown): Promise<unknown>;

  async command(chipId: string, command: ControlNamespace.RunnerCommand) {
    await this._request({
      type: 'command',
      chipId,
      command
    });
  }

  async createChip(options: { modelId: string; }) {
    await this._request({
      type: 'createChip',
      modelId: options.modelId
    });
  }

  async createDraft(draftId: string, source: string) {
    await this._request({
      type: 'createDraft',
      draftId,
      source
    });
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

  async startPlan(options: { chipId: string; data: UnitsCode; draftId: string; }) {
    await this._request({
      type: 'startPlan',
      chipId: options.chipId,
      codes: options.data,
      draftId: options.draftId
    });
  }
}
