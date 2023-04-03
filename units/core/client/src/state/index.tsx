import { ProtocolBlock, ProtocolState, BlockUnit, React, HeadUnit } from 'pr1';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  state: ProtocolState;
}

export interface BlockMetrics {

}

export interface Location {
  children: { 0?: unknown; };
  mode: LocationMode;
  state: Record<UnitNamespace, unknown>;
}

export enum LocationMode {
  AbortedState = 0,
  ApplyingState = 9,
  HaltingChild = 1,
  HaltingState = 2,
  Normal = 3,
  Paused = 8,
  PausedUnapplied = 13,
  PausingChild = 4,
  PausingState = 5,
  Resuming = 11,
  ResumingState = 10,
  SuspendingState = 6,
  Terminated = 7
}

export type Key = never;


export default {
  namespace: 'state',

  graphRenderer: {
    computeMetrics(block, ancestors, location, options, context) {
      return options.computeMetrics(block.child, [...ancestors, block], location?.children[0] ?? null);
    },

    render(block, path, metrics, position, location, options, context) {
      return options.render(block.child, [...path, null], metrics, position, location?.children[0] ?? null, options);
    }
  },

  HeadComponent(props) {
    if (!props.location) {
      return null;
    }

    return (
      <div>{LocationMode[props.location.mode]}</div>
    );
  },

  createActiveBlockMenu(block, location, options) {
    let busy = false;

    return [
      ...(location.mode === LocationMode.Normal
        ? [{ id: 'pause', name: 'Pause', icon: 'pause_circle', disabled: (location.mode !== LocationMode.Normal) || busy }]
        : [{ id: 'resume', name: 'Resume', icon: 'play_circle', disabled: busy }]),
      { id: 'halt', name: 'Skip', icon: 'double_arrow', disabled: busy }
    ];
  },
  getBlockClassLabel(block) {
    return 'State';
  },
  getActiveChildLocation(location, key) {
    return location.children[0];
  },
  getChildrenExecutionRefs(block, location) {
    return location.children[0]
      ? [{ blockKey: undefined as never, executionId: 0 }]
      : null;
  },
  getChildBlock(block, key) {
    return block.child;
  },
  isBlockPaused(block, location, options) {
    return [LocationMode.AbortedState, LocationMode.Paused, LocationMode.PausedUnapplied].includes(location.mode);
  },
  onSelectBlockMenu(block, location, path) {
    switch (path.first()) {
      case 'pause': return { type: 'pause' };
      case 'resume': return { type: 'resume' };
      case 'halt': return { type: 'halt' };
    }
  },
} satisfies BlockUnit<Block, BlockMetrics, Location, Key> & HeadUnit<Block, Location>
