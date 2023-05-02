import { Plugin, PluginBlockImpl } from 'pr1';
import { PluginName, ProtocolBlock, ProtocolBlockName } from 'pr1-shared';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  value: string;
}

export type Key = never;

export interface Location {

}


export default {
  namespace: ('name' as PluginName),
  blocks: {
    ['_' as ProtocolBlockName]: {
      getChild(block, key) {
        return block.child;
      },
    } satisfies PluginBlockImpl<Block, Key, Location>
  }
} satisfies Plugin
