import { GraphBlockMetrics, GraphLink, GraphRenderer, ProtocolBlock, React } from 'pr1';


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
  computeMetrics(block, options) {
    let childrenMetrics = block.children.map((child) => options.computeMetrics(child));

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
  render(block, metrics, position, state, options) {
    let children = block.children.map((child, index) => {
      let childState = (state?.index === index)
        ? state.child
        : null;

      let childSize = metrics.children[index];
      let el = options.render(child, childSize, {
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


export default {
  graphRenderer,
  namespace
}
