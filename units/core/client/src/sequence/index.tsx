import { GraphBlockMetrics, GraphLink, GraphRenderer, ProtocolBlock, ProtocolBlockPath, React } from 'pr1';


export interface Block extends ProtocolBlock {
  children: ProtocolBlock[];
}

export interface BlockMetrics extends GraphBlockMetrics {
  children: GraphBlockMetrics[];
  childrenX: number[];
}

export interface State {
  child: unknown;
  index: number;
}


const namespace = 'sequence';

const graphRenderer: GraphRenderer<Block, BlockMetrics, State> = {
  computeMetrics(block, ancestors, options) {
    let childrenMetrics = block.children.map((child, index) => options.computeMetrics(child, [...ancestors, block]));

    let xs = 0;
    let childrenX = childrenMetrics.map((childMetrics) => {
      let x = xs;
      xs += childMetrics.size.width + 2;
      return x;
    });

    let start = childrenMetrics[0].start;
    let end = childrenMetrics.at(-1).end;

    return {
      children: childrenMetrics,
      childrenX,
      start: { x: childrenX[0] + start.x, y: start.y },
      end: { x: childrenX.at(-1) + end.x, y: end.y },
      size: {
        width: childrenMetrics.reduce((sum, { size }) => sum + size.width, 0) + 2 * (childrenMetrics.length - 1),
        height: Math.max(...childrenMetrics.map(({ size }) => size.height))
      }
    };
  },
  render(block, path: ProtocolBlockPath, metrics, position, state, options) {
    let children = block.children.map((child, index) => {
      let childState = (state?.index === index)
        ? state.child
        : null;

      let childSize = metrics.children[index];
      let el = options.render(child, [...path, index], childSize, {
        x: position.x + metrics.childrenX[index],
        y: position.y
      }, childState);

      return <React.Fragment key={index}>{el}</React.Fragment>;
    });

    return (
      <>
        {new Array(children.length - 1).fill(0).map((_, index) => {
          let start = metrics.children[index].end;
          let startX = metrics.childrenX[index];

          let end = metrics.children[index + 1].start;
          let endX = metrics.childrenX[index + 1];

          return (
            <GraphLink
              link={{
                start: { x: position.x + startX + start.x, y: position.y + start.y },
                end: { x: position.x + endX + end.x, y: position.y + end.y }
              }}
              settings={options.settings}
              key={index} />
          );
        })}
        {children}
      </>
    );
  }
};

function getChildBlock(block: Block, key: number) {
  return block.children[key];
}

function getActiveChildState(state: State, _key: number) {
  return state.child;
}

function getChildrenExecutionKeys(_block: Block, state: State) {
  return [state.index];
}

function getBlockClassLabel(_block: Block) {
  return 'Sequence block';
}

function createActiveBlockMenu(_block: Block, _state: State) {
  return [
    { id: 'interrupt', name: 'Interrupt', icon: 'pan_tool' }
  ];
}


export default {
  createActiveBlockMenu,
  getChildBlock,
  getActiveChildState,
  getBlockClassLabel,
  getChildrenExecutionKeys,
  graphRenderer,
  namespace
}
