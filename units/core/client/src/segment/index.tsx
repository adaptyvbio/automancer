import { FeatureGroupDef, GraphBlockMetrics, GraphNode, GraphRenderer, ProtocolBlock, ProtocolBlockPath, ProtocolProcess, ProtocolState, React } from 'pr1';
import { MenuEntryPath } from 'pr1/lib/types/components/context-menu';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;
  process: ProtocolProcess;
  state: ProtocolState;
}

export interface BlockMetrics extends GraphBlockMetrics {
  features: FeatureGroupDef;
  name: string | null;
}

export interface State {
  mode: StateMode;
  process: unknown;
}

export enum StateMode {
  Normal = 0,
  Pausing = 1,
  Paused = 2
}


const namespace = 'segment';

const graphRenderer: GraphRenderer<Block, BlockMetrics, State> = {
  computeMetrics(block, ancestors, options) {
    let createFeaturesOptions = {
      host: options.host
    };

    let name = (block.state['name'] as { value: string | null; }).value;
    let features = [
      ...(options.host.units[block.process.namespace].createProcessFeatures?.(block.process.data, createFeaturesOptions)
        ?? [{ icon: 'not_listed_location', label: 'Unknown process' }])
        .map((feature) => ({ ...feature, accent: true })),
      ...Object.values(options.host.units).flatMap((unit) => {
        return unit?.createStateFeatures?.(block.state, null, createFeaturesOptions) ?? [];
      })
    ];

    let featureCount = features.length;
    let width = Math.round((280 + options.settings.nodePadding * 2) / options.settings.cellPixelSize);

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

  render(block, path, metrics, position, state, options) {
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
        path={path}
        selected={JSON.stringify(options.settings.editor.props.selectedBlockPath) === JSON.stringify(path)}
        settings={options.settings} />
    );
  }
};

function createActiveBlockMenu(block: Block, state: State) {
  return (state.mode !== StateMode.Paused)
    ? [{ id: 'pause', name: 'Pause', icon: 'pause_circle', disabled: (state.mode === StateMode.Pausing) }]
    : [{ id: 'resume', name: 'Resume', icon: 'play_circle' }];
}

function onSelectBlockMenu(block: Block, state: State, path: MenuEntryPath) {
  switch (path.first()) {
    case 'pause':
      return { 'type': 'pause' };
    case 'resume':
      return { 'type': 'resume' };
  }
}

function getChildrenExecutionKeys(block: Block, state: State, path: ProtocolBlockPath) {
  return null;
}

function transformBlockLabel(block: Block, state: State, label: string) {
  return `${label} (mode: ${StateMode[state.mode]})`;
}


export default {
  createActiveBlockMenu,
  getChildrenExecutionKeys,
  graphRenderer,
  namespace,
  onSelectBlockMenu,
  transformBlockLabel
}
