import * as React from 'react';
import { NodeContainer } from '../graph-editor';

import { BaseBlock, GraphBlockMetrics, GraphRenderer } from '../../interfaces/graph';


export default {
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
  render(block, metrics, position, options) {
    return (
      <>
        <NodeContainer
          cellSize={{ width: metrics.size.width, height: metrics.size.height }}
          position={position}
          settings={options.settings}
          title={`Repeat ${block.count} times`} />
        {options.render(block.child, metrics.child, {
          x: position.x + 1,
          y: position.y + 2
        })}
      </>
    );
  }
} as GraphRenderer<BaseBlock & {
  child: BaseBlock;
  count: number;
}, GraphBlockMetrics & {
  child: GraphBlockMetrics;
}>;
