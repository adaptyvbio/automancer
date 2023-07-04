import { PluginBlockImpl } from 'pr1';
import { MasterBlockLocation, ProtocolBlock, createZeroTerm } from 'pr1-shared';


export interface ApplierBlock extends ProtocolBlock {
  child: ProtocolBlock;
}

export interface ApplierLocation extends MasterBlockLocation {
  children: { 0: MasterBlockLocation };
  mode: 'applying' | 'halting' | 'normal';
}


export default {
  getChildren(block, context) {
    return [{
      block: block.child,
      delay: createZeroTerm()
    }];
  },
  getChildrenExecution(block, location, context) {
    return (location.mode === 'normal')
      ? [{ location: location.children[0] }]
      : null;
  }
} satisfies PluginBlockImpl<ApplierBlock, ApplierLocation>
