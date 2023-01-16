import { GraphRendererDefaultMetrics, GraphRenderer, Host, ProtocolBlock, ProtocolState, Unit, BlockUnit, React, UnitNamespace } from 'pr1';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  state: ProtocolState;
}

export interface BlockMetrics {

}

export interface Location {
  child: unknown;
  mode: LocationMode;
  state: Record<UnitNamespace, unknown>;
}

export enum LocationMode {
  Halting = 0,
  Normal = 1,
  PausingChild = 2,
  PausingState = 3,
  Paused = 4
}

export type Key = null;


export default {
  namespace: 'state',

  graphRenderer: {
    computeMetrics(block, ancestors, location, options, context) {
      return options.computeMetrics(block.child, [...ancestors, block], location?.child ?? null);
    },

    render(block, path, metrics, position, location, options, context) {
      return options.render(block.child, [...path, null], metrics, position, location?.child ?? null, options);
    }
  },

  createActiveBlockMenu(block, location, options) {
    let busy = false;

    return location.mode === LocationMode.Normal
      ? [{ id: 'pause', name: 'Pause', icon: 'pause_circle', disabled: (location.mode !== LocationMode.Normal) || busy }]
      : [{ id: 'resume', name: 'Resume', icon: 'play_circle', disabled: busy }];
  },
  getBlockClassLabel(block) {
    return 'State';
  },
  getActiveChildLocation(location, key) {
    return location.child;
  },
  getChildrenExecutionKeys(block, location) {
    return [null];
  },
  getChildBlock(block, key) {
    return block.child;
  },
  isBlockPaused(block, location, options) {
    return location.mode == LocationMode.Paused;
  },
  onSelectBlockMenu(block, location, path) {
    switch (path.first()) {
      case 'pause': return { type: 'pause' };
      case 'resume': return { type: 'resume' };
    }
  },
} satisfies BlockUnit<Block, BlockMetrics, Location, Key>
