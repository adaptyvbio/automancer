import { Features, GraphBlockMetrics, GraphNode, GraphRenderer, Point, ProtocolBlock, ProtocolSegment, React } from 'pr1';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;
  segment: ProtocolSegment;
}

export interface BlockMetrics extends GraphBlockMetrics {
  features: Features;
  start: Point;
  end: Point;
}


const namespace = 'segment';

const graphRenderer: GraphRenderer<Block, BlockMetrics> = {
  computeMetrics(block, options) {
    let features = options.units[block.segment.process.namespace].createProcessFeatures?.(block.segment.process.data, {}) ?? [
      { icon: 'not_listed_location', label: 'Unknown process' }
    ];

    let featureCount = features.length;
    let width = Math.round((220 + options.settings.nodePadding * 2) / options.settings.cellPixelSize);

    return {
      features,
      start: { x: 0, y: 1 },
      end: { x: width, y: 1 },
      size: {
        width,
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
      <GraphNode
        autoMove={false}
        cellSize={{
          width: metrics.size.width,
          height: metrics.size.height
        }}
        node={{
          id: 'a',
          title: null, // block.label,
          features: metrics.features,
          position
        }}
        selected={false}
        settings={options.settings} />
    );
  }
};


export default {
  graphRenderer,
  namespace
}
