import { DynamicValue, Plugin, PluginBlockImpl, formatDynamicValue } from 'pr1';
import { PluginName, ProtocolBlock, ProtocolBlockName } from 'pr1-shared';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  count: DynamicValue;
}

export interface Location {
  children: { 0: unknown; };
  count: number | null;
  iteration: number | null;
  mode: LocationMode;
}

export enum LocationMode {
  Failed = 0,
  Halting = 1,
  Normal = 2
}

export interface Point {
  child: unknown | null;
  iteration: number;
}


export default {
  namespace: ('repeat' as PluginName),

  blocks: {
    ['_' as ProtocolBlockName]: {
      Component(props) {
        return (
          <div>
            Mode: {LocationMode[props.location.mode]}
          </div>
        );
      },
      createFeatures(block, location, context) {
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

        if ((location?.mode === LocationMode.Normal) && ((numericCount === null) || (numericCount >= 2))) {
          label += ` (${location.iteration! + 1}`;

          if (numericCount !== null) {
            label += `/${numericCount}`;
          }

          label += ')';
        }

        return [{
          description,
          icon: 'replay',
          label
        }];
      },
      getChildren(block, context) {
        return [{
          block: block.child,
          delay: 0
        }];
      },
      getChildrenExecution(block, location, context) {
        return [{ location: location.children[0] }];
      },
      getLabel(block) {
        let numericCount = (block.count.type === 'number')
          ? block.count.value
          : null;

        if (numericCount !== null) {
          return 'Repeat ' + ({
            1: 'once',
            2: 'twice'
          }[numericCount] ?? `${numericCount} times`);
        } else {
          return (
            <>Repeat {formatDynamicValue(block.count)} times</>
          );
        }
      },
    } satisfies PluginBlockImpl<Block, Location>
  }
} satisfies Plugin;
