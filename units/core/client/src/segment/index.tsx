import { FeatureGroupDef, GraphBlockMetrics, GraphNode, GraphRenderer, ProtocolBlock, ProtocolProcess, ProtocolState, React } from 'pr1';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;
  process: ProtocolProcess,
  state: ProtocolState;
}

export interface BlockMetrics extends GraphBlockMetrics {
  features: FeatureGroupDef;
  name: string | null;
}

export interface State {
  process: unknown;
}


const namespace = 'segment';

const graphRenderer: GraphRenderer<Block, BlockMetrics, State> = {
  computeMetrics(block, options) {
    let name = (block.state['name'] as { value: string | null; }).value;
    let features = options.units[block.process.namespace].createProcessFeatures?.(block.process.data, {}) ?? [
      { icon: 'not_listed_location', label: 'Unknown process' }
    ];

    let featureCount = features.length;
    let width = Math.round((220 + options.settings.nodePadding * 2) / options.settings.cellPixelSize);

    return {
      features,
      name,

      start: { x: 0, y: 1 },
      end: { x: width, y: 1 },
      size: {
        width,
        height: Math.ceil((
          ((name !== null) ? options.settings.nodeHeaderHeight : 0)
          + (30 * featureCount)
          + (5.6 * (featureCount - 1))
          + (options.settings.nodeBodyPaddingY * 2)
          + (options.settings.nodePadding * 2)
        ) / options.settings.cellPixelSize)
      }
    };
  },

  render(block, metrics, position, state, options) {
    return (
      <GraphNode
        active={state !== null}
        autoMove={false}
        cellSize={{
          width: metrics.size.width,
          height: metrics.size.height
        }}
        node={{
          id: 'a',
          title: (metrics.name !== null) ? { value: metrics.name } : null,
          features: metrics.features,
          position
        }}
        settings={options.settings} />
    );
  }
};


export default {
  graphRenderer,
  namespace
}
