import { getBlockExplicitLabel, GraphBlockMetrics, GraphLink, GraphRenderer, NodeContainer, ProtocolBlock, ProtocolBlockPath, ProtocolState, React } from 'pr1';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;
  state: null;

  child: ProtocolBlock;
  count: number;
}

export interface BlockMetrics extends GraphBlockMetrics {
  child: GraphBlockMetrics;
}

export interface State {
  child: unknown;
  index: number;
}


const namespace = 'repeat';

const graphRenderer: GraphRenderer<Block, BlockMetrics, State> = {
  computeMetrics(block, ancestors, options) {
    let childMetrics = options.computeMetrics(block.child, [...ancestors, block]);

    return {
      child: childMetrics,

      start: {
        x: childMetrics.start.x + 1,
        y: childMetrics.start.y + 2
      },
      end: {
        x: childMetrics.end.x + 1,
        y: childMetrics.end.y + 2
      },
      size: {
        width: childMetrics.size.width + 2,
        height: childMetrics.size.height + 3
      }
    };
  },
  render(block, path: ProtocolBlockPath, metrics, position, state, options) {
    // let label = (block.state['name'] as { value: string | null; }).value;
    let label = getBlockExplicitLabel(block, options.host);

    return (
      <>
        <NodeContainer
          cellSize={{ width: metrics.size.width, height: metrics.size.height }}
          position={position}
          settings={options.settings}
          title={label ?? getBlockDefaultLabel(block)} />
        {options.render(block.child, [...path, null], metrics.child, {
          x: position.x + 1,
          y: position.y + 2
        }, state?.child ?? null)}
      </>
    );
  }
};

function getBlockDefaultLabel(block: Block) {
  return 'Repeat ' + ({
    1: 'once',
    2: 'twice'
  }[block.count] ?? `${block.count} times`);
}

function getChildBlock(block: Block, _key: never) {
  return block.child;
}


export default {
  getBlockDefaultLabel,
  getChildBlock,
  graphRenderer,
  namespace
}
