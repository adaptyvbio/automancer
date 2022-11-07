import * as React from 'react';

import { Node } from '../graph-editor';
import { BaseBlock, BaseMetrics, Renderer } from './spec';


export default {
  computeMetrics(block, options) {
    let featureCount = block.features.length;

    return {
      size: {
        width: Math.round((220 + options.settings.nodePadding * 2) / options.settings.cellPixelSize),
        height: Math.ceil((
          options.settings.nodeHeaderHeight
          + (24 * featureCount)
          + (5.6 * (featureCount - 1))
          + (options.settings.nodeBodyPaddingY * 2)
          + (options.settings.nodePadding * 2)
        ) / options.settings.cellPixelSize)
      }
    };
  },
  render(block, metrics, position, options) {
    return (
      <Node
        autoMove={false}
        cellSize={{
          width: metrics.size.width,
          height: metrics.size.height
        }}
        node={{
          id: 'a',
          title: block.label,
          features: block.features,
          position
        }}
        selected={false}
        settings={options.settings} />
    );
  }
} as Renderer<BaseBlock & {
  features: [
    { icon: 'hourglass_empty', label: '10 min' },
    { icon: 'air', label: 'Neutravidin' }
  ],
  label: string;
}, BaseMetrics>;
