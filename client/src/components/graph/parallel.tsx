import * as React from 'react';

import { Link } from '../graph-editor';
import { BaseBlock, GraphBlockMetrics, GraphRenderer } from '../../interfaces/graph';


const horizontalGap = 2;
const verticalGap = 0;

export default {
  computeMetrics(block, options) {
    let childrenMetrics = block.children.map((child) => options.computeMetrics(child));

    let ys = 0;
    let childrenY = childrenMetrics.map((childMetrics) => {
      let y = ys;
      ys += childMetrics.size.height + verticalGap;
      return y;
    });

    let start = childrenMetrics[0].start;
    let end = childrenMetrics.at(-1).end;

    return {
      children: childrenMetrics,
      childrenY,
      start: { x: childrenY[0] + start.x, y: start.y },
      end: { x: end.x + horizontalGap * 2, y: childrenY[0] + end.y },
      size: {
        width: Math.max(...childrenMetrics.map(({ size }) => size.width)) + horizontalGap * 2,
        height: ys
      }
    };
  },
  render(block, metrics, position, options) {
    let children = block.children.map((child, index) => {
      let childSize = metrics.children[index];
      let el = options.render(child, childSize, {
        x: position.x + horizontalGap,
        y: position.y + metrics.childrenY[index],
      });

      return <React.Fragment key={child.id}>{el}</React.Fragment>;
    });

    return (
      <>
        {metrics.children.map((childMetrics, index) => {
          let y = metrics.childrenY[index];

          return (
            <>
              <Link
                link={{
                  start: { x: position.x + metrics.start.x, y: position.y + metrics.start.y },
                  end: { x: position.x + horizontalGap + childMetrics.start.x, y: position.y + y + childMetrics.start.y }
                }}
                settings={options.settings}
                key={index} />
              <Link
                link={{
                  start: { x: position.x + horizontalGap + childMetrics.end.x, y: position.y + y + childMetrics.end.y },
                  end: { x: position.x + metrics.end.x, y: position.y + metrics.end.y }
                }}
                settings={options.settings}
                key={index} />
            </>
          );
        })}
        {children}
      </>
    );
  }
} as GraphRenderer<BaseBlock & {
  children: BaseBlock[];
}, GraphBlockMetrics & {
  children: GraphBlockMetrics[];
  childrenY: number[];
}>;
