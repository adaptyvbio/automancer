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

export interface Location {
  child: unknown;
  iteration: number;
}

export interface Point {
  child: unknown | null;
  iteration: number;
}

export interface State {
  child: unknown;
  index: number;
}


const namespace = 'repeat';

const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
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
  render(block, path: ProtocolBlockPath, metrics, position, location, options) {
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
        }, location?.child ?? null, options)}
      </>
    );
  }
};


function createDefaultPoint(block: Block, key: number, getChildPoint: (block: ProtocolBlock) => unknown) {
  return {
    child: getChildPoint(block.child),
    iteration: 0
  };
}

function getBlockDefaultLabel(block: Block) {
  return 'Repeat ' + ({
    1: 'once',
    2: 'twice'
  }[block.count] ?? `${block.count} times`);
}

function getActiveChildState(location: Location, _key: number) {
  return location.child;
}

function getChildBlock(block: Block, _key: never) {
  return block.child;
}

function getChildrenExecutionKeys(_block: Block, location: Location) {
  return [location.iteration];
}

function getBlockLocationLabelSuffix(block: Block, location: Location) {
  return `(${location.iteration}/${block.count})`;
}


export default {
  createDefaultPoint,
  getActiveChildState,
  getBlockDefaultLabel,
  getBlockLocationLabelSuffix,
  getChildBlock,
  getChildrenExecutionKeys,
  graphRenderer,
  namespace
}
