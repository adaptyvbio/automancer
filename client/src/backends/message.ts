import { BackendCommon, Chip, ChipId, ControlNamespace } from './common';
import type { UnitsCode } from '../units';


export abstract class MessageBackend extends BackendCommon {
  protected abstract _send(message: unknown): void;

  async command(chipId: string, command: ControlNamespace.RunnerCommand) {
    this._send({
      type: 'command',
      chipId,
      command
    });
  }

  async createChip(options: { modelId: string; }) {
    this._send({
      type: 'createChip',
      modelId: options.modelId
    });
  }

  async createDraft(draftId: string, source: string) {
    this._send({
      type: 'createDraft',
      draftId,
      source
    });
  }

  async deleteChip(chipId: ChipId) {
    this._send({
      type: 'deleteChip',
      chipId
    });
  }

  async pause(chipId: string, options: { neutral: boolean; }) {
    this._send({
      type: 'pause',
      chipId,
      options
    });
  }

  async resume(chipId: string) {
    this._send({
      type: 'resume',
      chipId
    });
  }

  async setMatrix(chipId: ChipId, update: Partial<Chip['matrices']>) {
    this._send({
      type: 'setMatrix',
      chipId,
      update
    });
  }

  async skipSegment(chipId: ChipId, segmentIndex: number, processState?: object) {
    this._send({
      type: 'skipSegment',
      chipId,
      processState: processState ?? null,
      segmentIndex
    });
  }

  async startPlan(options: { chipId: string; data: UnitsCode; draftId: string; }) {
    this._send({
      type: 'startPlan',
      chipId: options.chipId,
      codes: options.data,
      draftId: options.draftId
    })
  }
}
