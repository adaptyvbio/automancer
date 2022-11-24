import { GraphBlockMetrics, GraphLink, GraphRenderer, NodeContainer, ProtocolBlock, ProtocolState, React } from 'pr1';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;
  state: ProtocolState;

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
  computeMetrics(block, options) {
    let childMetrics = options.computeMetrics(block.child);

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
  render(block, metrics, position, state, options) {
    let formattedCount = {
      1: 'once',
      2: 'twice'
    }[block.count] ?? `${block.count} times`;
    let name = (block.state['name'] as { value: string | null; }).value;

    return (
      <>
        <NodeContainer
          cellSize={{ width: metrics.size.width, height: metrics.size.height }}
          position={position}
          settings={options.settings}
          title={name ?? `Repeat ${formattedCount}`} />
        {options.render(block.child, metrics.child, {
          x: position.x + 1,
          y: position.y + 2
        }, state?.child ?? null)}
      </>
    );
  }
};


export default {
  graphRenderer,
  namespace
}
