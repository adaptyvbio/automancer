import { Plugin, PluginBlockImpl } from 'pr1';
import { PluginName, ProtocolBlock, ProtocolBlockName } from 'pr1-shared';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
}

export interface Location {
  rows: number;
}

export default {
  namespace: ('record' as PluginName),

  blocks: {
    ['_' as ProtocolBlockName]: {
      createFeatures(block, location, context) {
        return [
          { icon: 'monitoring',
            label: 'Record data' + (location ? ` (${location.rows} rows)` : '') }
        ];
      },
      getChildren(block, context) {
        return [block.child];
      },
    } satisfies PluginBlockImpl<Block, Location>
  }
} satisfies Plugin;
