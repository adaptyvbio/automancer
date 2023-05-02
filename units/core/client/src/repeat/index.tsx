import { ProtocolBlockGraphRendererMetrics, ProtocolBlockGraphRenderer, GraphNodeContainer, React, UnitTools, BlockUnit, formatDynamicValue, DynamicValue, Plugin, PluginBlockImpl } from 'pr1';
import { PluginName, ProtocolBlock, ProtocolBlockName } from 'pr1-shared';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  count: DynamicValue;
}

export interface BlockMetrics extends ProtocolBlockGraphRendererMetrics {
  child: ProtocolBlockGraphRendererMetrics;
  label: string;
}

export interface Location {
  children: { 0: unknown; };
  count: number;
  iteration: number;
}

export type Key = 0;

export interface Point {
  child: unknown | null;
  iteration: number;
}


export default {
  namespace: ('repeat' as PluginName),

  blocks: {
    ['_' as ProtocolBlockName]: {
      createEntries(block, location) {
        let numericCount = location?.count ?? (
          (block.count.type === 'number')
            ? block.count.value
            : null
        );

        let [description, label] = (numericCount !== 0)
          ? [
            'Repeat',
            (numericCount !== null)
              ? {
                1: 'Once',
                2: 'Twice'
              }[numericCount] ?? `${numericCount} times`
              : <>formatDynamicValue(block.count) times</>
          ]
          : [null, 'Skip'];

        return [{
          features: [{
            description,
            icon: 'replay',
            label
          }]
        }];
      },
      getChild(block, key) {
        return block.child;
      },
      getClassLabel(block) {
        return 'Repeat';
      }
    } satisfies PluginBlockImpl<Block, Key, Location>
  }
} satisfies Plugin;


//   namespace,
//   graphRenderer,

//   createActiveBlockMenu(block, location, options) {
//     return [
//       { id: 'halt', name: 'Skip', icon: 'double_arrow' }
//     ];
//   },
//   createDefaultPoint(block, key: number, getChildPoint) {
//     return {
//       child: getChildPoint(block.child),
//       iteration: 0
//     };
//   },
//   getBlockClassLabel(block, context) {
//     return 'Repeat';
//   },
//   getBlockLabel(block, location, context) {
//     let numericCount = location?.count ?? (
//       (block.count.type === 'number')
//         ? block.count.value
//         : null
//     );

//     if (numericCount !== null) {
//       return 'Repeat ' + ({
//         1: 'once',
//         2: 'twice'
//       }[numericCount] ?? `${numericCount} times`);
//     } else {
//       return (
//         <>Repeat {formatDynamicValue(block.count)} times</>
//       );
//     }
//   },
//   getBlockLabelSuffix(block, location, context) {
//     return `(${location.iteration + 1}/${location.count})`;
//   },
//   getActiveChildLocation(location, key: number) {
//     return location.children[0];
//   },
//   getChildBlock(block, key: never) {
//     return block.child;
//   },
//   getChildrenExecutionRefs(block, location) {
//     return [{ blockKey: 0, executionId: 0 }];
//   },
//   onSelectBlockMenu(block, location, path) {
//     switch (path.first()) {
//       case 'halt':
//         return { type: 'halt' };
//     }
//   }
// } satisfies BlockUnit<Block, BlockMetrics, Location, Key>;

// export default unit;
