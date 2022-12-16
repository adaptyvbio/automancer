import { GraphBlockMetrics, GraphRenderer, Host, ProtocolBlock, ProtocolState, Unit } from 'pr1';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  state: ProtocolState;
}

export interface Location {
  child: unknown;
  mode: LocationMode;
}

export enum LocationMode {
  Halting = 0,
  Normal = 1,
  PausingChild = 2,
  PausingState = 3,
  Paused = 4
}


export type BlockMetrics = GraphBlockMetrics;


const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
  computeMetrics(block, ancestors, options) {
    return options.computeMetrics(block.child, [...ancestors, block]);
  },

  render(block, path, metrics, position, location, options) {
    return options.render(block.child, [...path, null], metrics, position, location?.child ?? null, options);
  }
};


export default {
  namespace: 'state',

  graphRenderer,

  createActiveBlockMenu(_block, location, _options) {
    let busy = false;

    return location.mode === LocationMode.Normal
      ? [{ id: 'pause', name: 'Pause', icon: 'pause_circle', disabled: (location.mode !== LocationMode.Normal) || busy }]
      : [{ id: 'resume', name: 'Resume', icon: 'play_circle', disabled: busy }];
  },
  getBlockClassLabel(_block) {
    return 'State';
  },
  getActiveChildLocation(location, key) {
    return location.child;
  },
  getChildrenExecutionKeys(_block, _location) {
    return [null];
  },
  getChildBlock(block, _key) {
    return block.child;
  },
  isBlockPaused(_block, location, _options) {
    return location.mode == LocationMode.Paused;
  },
  onSelectBlockMenu(block, location, path) {
    switch (path.first()) {
      case 'pause': return { type: 'pause' };
      case 'resume': return { type: 'resume' };
    }
  },
} satisfies Unit<Block, Location>
