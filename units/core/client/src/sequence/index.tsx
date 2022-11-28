import { GraphBlockMetrics, GraphLink, GraphRenderer, ProtocolBlock, ProtocolBlockPath, React, Unit } from 'pr1';


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


const horizontalCellGap = 2;
const verticalCellGap = 1;

const namespace = 'sequence';

const graphRenderer: GraphRenderer<Block, BlockMetrics, State> = {
  computeMetrics(block, ancestors, options) {
    let vertical = options.settings.vertical;
    let verticalFlag = vertical ? 1 : 0;

    let childrenMetrics = block.children.map((child, index) => options.computeMetrics(child, [...ancestors, block]));

    let xs = 0;
    let childrenX = childrenMetrics.map((childMetrics, childIndex) => {
      let x = xs;
      let notLastFlag = (childIndex < (childrenMetrics.length - 1)) ? 1 : 0;

      xs += vertical
        ? (childMetrics.size.height + verticalCellGap * notLastFlag)
        : (childMetrics.size.width + horizontalCellGap * notLastFlag);

      return x;
    });

    let start = childrenMetrics[0].start;
    let end = childrenMetrics.at(-1).end;

    return {
      children: childrenMetrics,
      childrenX,
      start: {
        x: childrenX[0] * (1 - verticalFlag) + start.x,
        y: childrenX[0] * verticalFlag + start.y
      },
      end: {
        x: childrenX.at(-1) * (1 - verticalFlag) + end.x,
        y: childrenX.at(-1) * verticalFlag + end.y
      },
      size: vertical
        ? {
          width: Math.max(...childrenMetrics.map(({ size }) => size.width)),
          height: xs
        }
        : {
          width: childrenMetrics.reduce((sum, { size }) => sum + size.width, 0) + 2 * (childrenMetrics.length - 1),
          height: Math.max(...childrenMetrics.map(({ size }) => size.height))
        }
    };
  },
  render(block, path: ProtocolBlockPath, metrics, position, state, options) {
    let vertical = options.settings.vertical;
    let verticalFlag = vertical ? 1 : 0;
    let linkDirection = (vertical ? 'vertical' : 'horizontal') as 'vertical' | 'horizontal';

    let children = block.children.map((child, index) => {
      let childState = (state?.index === index)
        ? state.child
        : null;

      let childX = metrics.childrenX[index];
      let childSize = metrics.children[index];

      let el = options.render(child, [...path, index], childSize, {
        x: position.x + childX * (1 - verticalFlag),
        y: position.y + childX * verticalFlag
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
                start: {
                  direction: linkDirection,
                  x: position.x + start.x + startX * (1 - verticalFlag),
                  y: position.y + start.y + startX * verticalFlag
                },
                end: {
                  direction: linkDirection,
                  x: position.x + end.x + endX * (1 - verticalFlag),
                  y: position.y + end.y + endX * verticalFlag
                }
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
} satisfies Unit
