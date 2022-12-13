import { FeatureGroupDef, formatHostSettings, GraphBlockMetrics, GraphNode, GraphRenderer, Host, MenuEntryPath, ProtocolBlock, ProtocolBlockPath, ProtocolProcess, ProtocolState, React, Unit } from 'pr1';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;
  process: ProtocolProcess;
  state: ProtocolState;
}

export interface BlockMetrics extends GraphBlockMetrics {
  features: FeatureGroupDef;
  name: string | null;
}

export interface Location {
  mode: LocationMode;
  process: unknown;
}

export enum LocationMode {
  Halting = 4,
  Normal = 0,
  PausingProcess = 1,
  PausingState = 2,
  Paused = 3
}

export interface Point {
  process: unknown | null;
}


const namespace = 'segment';

const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
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
        return unit?.createStateFeatures?.(block.state, null, null, createFeaturesOptions) ?? [];
      })
    ];

    let featureCount = features.length;
    let width = Math.round((280 + options.settings.nodePadding * 2) / options.settings.cellPixelSize);
    let height = Math.ceil((
      ((name !== null) ? options.settings.nodeHeaderHeight : 0)
      + (30 * featureCount)
      + (5.6 * (featureCount - 1))
      + (options.settings.nodeBodyPaddingY * 2)
      + (options.settings.nodePadding * 2)
      + (options.settings.nodeBorderWidth * 2)
    ) / options.settings.cellPixelSize);

    return {
      features,
      name,

      start: { x: 0, y: 0 },
      end: options.settings.vertical
        ? { x: 0, y: height }
        : { x: width, y: 0 },
      size: {
        width,
        height
      }
    };
  },

  render(block, path, metrics, position, location, options) {
    let active = (location !== null);
    let vertical = options.settings.vertical;

    return (
      <GraphNode
        active={active}
        attachmentPoints={{
          bottom: (options.attachmentEnd && vertical),
          left: (options.attachmentStart && !vertical),
          right: (options.attachmentEnd && !vertical),
          top: (options.attachmentStart && vertical)
        }}
        autoMove={false}
        cellSize={{
          width: metrics.size.width,
          height: metrics.size.height
        }}
        createMenu={() => {
          return [
            ...(active
              ? createActiveBlockMenu(block, location!)
              : []),
            { id: 'jump', name: 'Jump to', icon: 'move_down' },
            { id: 'skip', name: 'Skip', icon: 'playlist_remove' }
          ];
        }}
        node={{
          id: 'a',
          title: (metrics.name !== null) ? { value: metrics.name } : null,
          features: metrics.features,
          position
        }}
        onSelectBlockMenu={(menuPath) => {
          let message = onSelectBlockMenu(block, location!, menuPath);

          if (message) {
            // ...
            return;
          }

          switch (menuPath.first()) {
            case 'jump': {
              let tree = options.settings.editor.props.tree!;

              let getChildPoint = (block: ProtocolBlock, path: ProtocolBlockPath): unknown => {
                let unit = options.host.units[block.namespace];
                return unit.createDefaultPoint!(block, path[0], (block) => getChildPoint(block, path.slice(1)));
              };

              let point = getChildPoint(tree, path);
              options.settings.editor.props.execution.jump(point);
            }
          }
        }}
        path={path}
        selected={JSON.stringify(options.settings.editor.props.selectedBlockPath) === JSON.stringify(path)}
        settings={options.settings} />
    );
  }
};

function createActiveBlockMenu(block: Block, location: Location) {
  return [
    ...((location.mode !== LocationMode.Paused)
      ? [{ id: 'pause', name: 'Pause', icon: 'pause_circle', disabled: (location.mode !== LocationMode.Normal) }]
      : [{ id: 'resume', name: 'Resume', icon: 'play_circle' }]),
    { id: 'halt', name: 'Halt', icon: 'block' }
  ];
}

function createDefaultPoint(block: Block, key: null, getChildPoint: (block: ProtocolBlock) => unknown) {
  return {
    process: null
  };
}

function isBlockPaused(_block: Block, location: Location) {
  return (location.mode === LocationMode.Paused);
}

function onSelectBlockMenu(_block: Block, location: Location, path: MenuEntryPath) {
  switch (path.first()) {
    case 'halt':
      return { 'type': 'halt' };
    case 'pause':
      return { 'type': 'pause' };
    case 'resume':
      return { 'type': 'resume' };
  }
}

function getChildrenExecutionKeys(block: Block, location: Location, path: ProtocolBlockPath) {
  return null;
}

function getBlockDefaultLabel(block: Block, host: Host) {
  let unit = host.units[block.process.namespace];
  return unit.getProcessLabel?.(block.process.data) ?? null;
}

function getBlockLocationLabelSuffix(block: Block, location: Location) {
  return `(mode: ${LocationMode[location.mode]}, ${location.mode})`;
}


export default {
  createActiveBlockMenu,
  createDefaultPoint,
  getBlockDefaultLabel,
  getBlockLocationLabelSuffix,
  getChildrenExecutionKeys,
  graphRenderer,
  isBlockPaused,
  namespace,
  onSelectBlockMenu
} satisfies Unit
