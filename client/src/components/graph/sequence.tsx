import * as React from 'react';

import { BaseBlock, BaseMetrics, Renderer } from './spec';


export default {
  computeMetrics(block, options) {
    let childrenMetrics = block.children.map((child) => options.computeMetrics(child));

    return {
      children: childrenMetrics,
      size: {
        width: childrenMetrics.reduce((sum, { size }) => sum + size.width, 0) + 2 * (childrenMetrics.length - 1),
        height: Math.max(...childrenMetrics.map(({ size }) => size.height))
      }
    };
  },
  render(block, metrics, position, options) {
    let children = block.children.map((child, index) => {
      let childSize = metrics.children[index];
      let el = options.render(child, childSize, { ...position });

      position.x += childSize.size.width + 2;
      return <React.Fragment key={child.id}>{el}</React.Fragment>;
    });

    return (
      <>
        {children}
      </>
    );
  }
} as Renderer<BaseBlock & {
  children: BaseBlock[];
}, BaseMetrics & {
  children: BaseMetrics[];
}>;
