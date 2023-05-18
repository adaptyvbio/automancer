import { PluginBlockImpl } from 'pr1';
import { ProtocolBlock } from 'pr1-shared';


export interface ApplierBlock extends ProtocolBlock {
  child: ProtocolBlock;
}

export interface ApplierLocation {
  children: { 0: unknown };
  mode: ApplierLocationMode;
}

export enum ApplierLocationMode {
  Applying = 0,
  Halting = 2,
  Normal = 1
}


export default {
  getChildren(block, context) {
    return [block.child];
  },
  getChildrenExecution(block, location, context) {
    return (location.mode === ApplierLocationMode.Normal)
      ? [{ location: location.children[0] }]
      : null;
  }
} satisfies PluginBlockImpl<ApplierBlock, ApplierLocation>
