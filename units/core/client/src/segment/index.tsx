import { GraphNode, Host, MenuEntryPath, Plugin, PluginBlockImpl, ProcessUnit, ProtocolBlockGraphRenderer, ProtocolError, ProtocolProcess, UnitTools } from 'pr1';
import { PluginName, ProtocolBlock, ProtocolBlockName, ProtocolBlockPath } from 'pr1-shared';


export interface Block extends ProtocolBlock {
  process: ProtocolProcess;
}

export interface Location {
  error: ProtocolError | null;
  mode: LocationMode;
  pausable: boolean;
  process: unknown | null;
  time: number;
}

export enum LocationMode {
  Broken = 0,
  Halting = 1,
  Normal = 2,
  Pausing = 3,
  Paused = 4,
  ResumingParent = 8,
  ResumingProcess = 9,
  Starting = 6,
  Terminated = 7
}

export type Key = never;

export interface Point {
  process: unknown | null;
}


const computeGraph: ProtocolBlockGraphRenderer<Block, Key, Location> = (block, path, ancestors, location, options, context) => {
  let parentBlock = ancestors.at(-1);
  let state = UnitTools.getBlockState(parentBlock);
  let name = state && UnitTools.getBlockStateNameFromState(state);

  let processUnit = context.host.units[block.process.namespace] as ProcessUnit<unknown, unknown>;
  let processFeatures = UnitTools.ensureProcessFeatures(processUnit.createProcessFeatures(block.process.data, null, context) ?? []);
  let stateFeatures = state
    ? Object.values(context.host.units).flatMap((unit) => {
      return (unit.namespace in state!)
        ? UnitTools.asStateUnit(unit)?.createStateFeatures?.(state![unit.namespace], null, null, context) ?? []
        : [];
    })
    : [];

  let features = [
    ...processFeatures,
    ...processFeatures,
    ...stateFeatures
  ];

  let featureCount = features.length;
  let settings = options.settings;

  let width = Math.round((280 + settings.nodePadding * 2) / settings.cellPixelSize);
  let height = Math.ceil((
    ((name !== null) ? settings.nodeHeaderHeight : 0)
    + (30 * featureCount)
    + (5.6 * (featureCount - 1))
    + (settings.nodeBodyPaddingY * 2)
    + (settings.nodePadding * 2)
    + (settings.nodeBorderWidth * 2)
  ) / settings.cellPixelSize);

  return {
    compactable: true,
    start: { x: 0, y: 0 },
    end: options.settings.vertical
      ? { x: 0, y: height }
      : { x: width, y: 0 },
    size: {
      width,
      height
    },

    render(position, renderOptions) {
      let active = false; // (location !== null);

      return (
        <GraphNode
          active={active}
          autoMove={false}
          cellSize={{
            width,
            height
          }}
          createMenu={() => {
            return [
              ...(active
                ? createActiveBlockMenu(block, location!, context)
                : []),
              { id: 'jump', name: 'Jump to', icon: 'move_down' },
              { id: 'skip', name: 'Skip', icon: 'playlist_remove' }
            ];
          }}
          node={{
            id: '_',
            title: (name !== null) ? { value: name } : null,
            features,
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
                  let unit = UnitTools.asBlockUnit(context.host.units[block.namespace])!;
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
};

function createActiveBlockMenu(block: Block, location: Location, options: { host: Host; }) {
  let busy = false; // isBlockBusy(block, location, options);

  return [
    ...((location.mode !== LocationMode.Paused)
      ? [{ id: 'pause', name: 'Pause', icon: 'pause_circle', disabled: busy }]
      : [{ id: 'resume', name: 'Resume', icon: 'play_circle', disabled: busy }]),
    { id: 'halt', name: 'Skip', icon: 'double_arrow', disabled: busy }
  ];
}

function createDefaultPoint(block: Block, key: null, getChildPoint: (block: ProtocolBlock) => unknown) {
  return {
    process: null
  };
}

function isBlockBusy(_block: Block, location: Location, _options: { host: Host; }) {
  return ![LocationMode.Normal, LocationMode.Paused].includes(location.mode);
}

function isBlockPaused(_block: Block, location: Location, _options: { host: Host; }) {
  return [LocationMode.Broken, LocationMode.Paused].includes(location.mode);
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


export default {
  namespace: ('segment' as PluginName),

  blocks: {
    ['_' as ProtocolBlockName]: {
      computeGraph,
      createEntries(block, location) {
        return [{
          features: [
            { icon: 'not_listed_location',
              label: 'Process' }
          ]
        }];
      }
    } satisfies PluginBlockImpl<Block, Key, Location>
  },

  // graphRenderer,

  // HeadComponent(props) {
  //   let process = props.block.process;
  //   let processLocation = props.location?.process ?? null;
  //   let processUnit = UnitTools.asProcessUnit(props.context.host.units[process.namespace])!;

  //   let ProcessComponent = processLocation && processUnit.ProcessComponent;
  //   let broken = (props.location?.mode === LocationMode.Broken);

  //   return (
  //     <>
  //       <SimpleFeatureList list={[
  //         UnitTools.ensureProcessFeatures(processUnit.createProcessFeatures(process.data, processLocation, props.context))
  //       ]} />

  //       {props.location && <p style={{ margin: '1rem' }}>Mode: {LocationMode[props.location.mode]}</p>}

  //       {ProcessComponent && (
  //         !broken
  //           ? <ProcessComponent
  //               context={props.context}
  //               data={process.data}
  //               location={processLocation!}
  //               time={props.location!.time} />
  //           : <DiagnosticsReport diagnostics={[
  //             { kind: 'error',
  //               message: props.location!.error!.message,
  //               ranges: [] }
  //           ]} />
  //       )}
  //     </>
  //   );
  // },

  // getChildrenExecutionRefs(block, location) {
  //   return null;
  // },
  // getBlockClassLabel(block, context) {
  //   return 'Segment';
  // },
  // getBlockLabel(block, location, context) {
  //   let unit = UnitTools.asProcessUnit(context.host.units[block.process.namespace])!;
  //   return unit.getProcessLabel?.(block.process.data, context) ?? null;
  // },
  // // getBlockLabelSuffix(block, location, context) {
  // //   return `(mode: ${LocationMode[location.mode]}, ${location.mode})`;
  // // },

  // createActiveBlockMenu,
  // createDefaultPoint,
  // isBlockBusy,
  // isBlockPaused,
  // onSelectBlockMenu
} satisfies Plugin; // <Block, BlockMetrics, Location, Key> & HeadUnit<Block, Location>;
