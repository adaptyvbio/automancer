import { GraphRendererDefaultMetrics, GraphRenderer, NodeContainer, ProtocolBlock, ProtocolBlockPath, React, UnitTools, BlockUnit, formatDynamicValue, DynamicValue } from 'pr1';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;
  state: null;

  child: ProtocolBlock;
  count: DynamicValue;
}

export interface BlockMetrics extends GraphRendererDefaultMetrics {
  child: GraphRendererDefaultMetrics;
  label: string;
}

export interface Location {
  child: unknown;
  iteration: number;
}

export type Key = number;

export interface Point {
  child: unknown | null;
  iteration: number;
}

export interface State {
  child: unknown;
  index: number;
}


const namespace = 'repeat';

const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
  computeMetrics(block, ancestors, location, options, context) {
    let childMetrics = options.computeMetrics(block.child, [...ancestors, block], location?.child);

    let parent = ancestors.at(-1);
    let label = (parent && UnitTools.getBlockStateName(parent))
      ?? unit.getBlockDefaultLabel(block);
    // let label = ancestors.at(-1)?.state['name'].value
    //   ?? getBlockExplicitLabel(block, context.host)
    //   ?? unit.getBlockDefaultLabel(block);

    return {
      child: childMetrics,
      label,

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
  render(block, path: ProtocolBlockPath, metrics, position, location, options, context) {
    // let label = (block.state['name'] as { value: string | null; }).value;

    return (
      <>
        <NodeContainer
          cellSize={{ width: metrics.size.width, height: metrics.size.height }}
          position={position}
          settings={options.settings}
          title={metrics.label} />
        {options.render(block.child, [...path, null], metrics.child, {
          x: position.x + 1,
          y: position.y + 2
        }, location?.child ?? null, options)}
      </>
    );
  }
};


const unit = {
  namespace: 'repeat',

  graphRenderer,

  createActiveBlockMenu(block, location, options) {
    return [
      { id: 'halt', name: 'Skip', icon: 'double_arrow' }
    ];
  },
  createDefaultPoint(block, key: number, getChildPoint) {
    return {
      child: getChildPoint(block.child),
      iteration: 0
    };
  },
  getBlockClassLabel(block) {
    return 'Repeat';
  },
  getBlockDefaultLabel(block) {
    if (block.count.type === 'number') {
      return 'Repeat ' + ({
        1: 'once',
        2: 'twice'
      }[block.count.value] ?? `${block.count.value} times`);
    }

    let count = formatDynamicValue(block.count);

    return (
      <>Repeat {count} times</>
    );
  },
  getActiveChildLocation(location, key: number) {
    return location.child;
  },
  getChildBlock(block, key: never) {
    return block.child;
  },
  getChildrenExecutionRefs(block, location) {
    return [location.iteration];
  },
  getBlockLocationLabelSuffix(block, location) {
    return `(${location.iteration}/${block.count})`;
  },
  onSelectBlockMenu(block, location, path) {
    switch (path.first()) {
      case 'halt':
        return { type: 'halt' };
    }
  }
} satisfies BlockUnit<Block, BlockMetrics, Location, Key>;


export default unit
