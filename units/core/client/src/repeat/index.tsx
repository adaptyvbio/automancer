import { GraphRendererDefaultMetrics, GraphRenderer, NodeContainer, ProtocolBlock, UnitTools, BlockUnit, formatDynamicValue, DynamicValue } from 'pr1';
import { UnitNamespace } from 'pr1-shared';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;

  child: ProtocolBlock;
  count: DynamicValue;
}

export interface BlockMetrics extends GraphRendererDefaultMetrics {
  child: GraphRendererDefaultMetrics;
  label: string;
}

export interface Location {
  children: { 0: unknown; };
  count: number;
  iteration: number;
}

export type Key = number;

export interface Point {
  child: unknown | null;
  iteration: number;
}


const namespace = ('repeat' as UnitNamespace);

const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
  computeMetrics(block, ancestors, location, options, context) {
    let childMetrics = options.computeMetrics(block.child, [...ancestors, block], location?.children[0]);

    let parent = ancestors.at(-1);
    let label = (parent && UnitTools.getBlockStateName(parent))
      ?? unit.getBlockLabel(block, null, context);

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
  render(block, path, metrics, position, location, options, context) {
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
        }, location?.children[0] ?? null, options)}
      </>
    );
  }
};


const unit = {
  namespace,
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
  getBlockClassLabel(block, context) {
    return 'Repeat';
  },
  getBlockLabel(block, location, context) {
    let numericCount = location?.count ?? (
      (block.count.type === 'number')
        ? block.count.value
        : null
    );

    if (numericCount !== null) {
      return 'Repeat ' + ({
        1: 'once',
        2: 'twice'
      }[numericCount] ?? `${numericCount} times`);
    } else {
      return (
        <>Repeat {formatDynamicValue(block.count)} times</>
      );
    }
  },
  getBlockLabelSuffix(block, location, context) {
    return `(${location.iteration + 1}/${location.count})`;
  },
  getActiveChildLocation(location, key: number) {
    return location.children[0];
  },
  getChildBlock(block, key: never) {
    return block.child;
  },
  getChildrenExecutionRefs(block, location) {
    return [{ blockKey: 0, executionId: 0 }];
  },
  onSelectBlockMenu(block, location, path) {
    switch (path.first()) {
      case 'halt':
        return { type: 'halt' };
    }
  }
} satisfies BlockUnit<Block, BlockMetrics, Location, Key>;

export default unit;
