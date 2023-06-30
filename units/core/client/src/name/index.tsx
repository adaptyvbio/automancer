import { Plugin, PluginBlockImpl } from 'pr1';
import { MasterBlockLocation, PluginName, ProtocolBlock, ProtocolBlockName, createZeroTerm } from 'pr1-shared';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  value: string;
}

export interface Location extends MasterBlockLocation {

}


export default {
  namespace: ('name' as PluginName),
  blocks: {
    ['_' as ProtocolBlockName]: {
      getChildren(block, context) {
        return [{
          block: block.child,
          delay: createZeroTerm()
        }];
      },
      getChildrenExecution(block, location, context) {
        return [{
          location: location.children[0]
        }];
      }
    } satisfies PluginBlockImpl<Block, Location>
  }
} satisfies Plugin
