import { Point as GeometryPoint, GraphLink, Plugin, PluginBlockImpl, ProtocolBlockGraphRenderer, ProtocolBlockGraphRendererNodeInfo } from 'pr1';
import { AnyDurationTerm, MasterBlockLocation, PluginName, ProtocolBlock, ProtocolBlockName } from 'pr1-shared';
import { Fragment } from 'react';


export interface Block extends ProtocolBlock {
  children: ProtocolBlock[];
  childrenDelays: AnyDurationTerm[];
}

export interface Location extends MasterBlockLocation {
  index: number;
  interrupting: boolean;
}

export interface Point {
  child: unknown | null;
  index: number;
}


const horizontalCellGap = 2;
const verticalCellGap = 1;

const computeGraph: ProtocolBlockGraphRenderer<Block, Location> = (block, path, ancestors, location, options, context) => {
  let vertical = options.settings.vertical;

  let childrenMetrics = block.children.map((child, childIndex) => options.computeMetrics(childIndex));
  let linksCompact: boolean[] = [];

  let inlineDirSize = Math.max(...childrenMetrics.map(({ size }) => vertical ? size.width : size.height));

  let currentBlockDirPos = 0;
  let wasCompactable = false;

  let childrenPos = childrenMetrics.map((childMetrics, childIndex): GeometryPoint => {
    if (childIndex > 0) {
      let compact = options.settings.allowCompactActions && wasCompactable && !!childMetrics.compactable;
      linksCompact.push(compact);

      if (!compact) {
        currentBlockDirPos += vertical
          ? verticalCellGap
          : horizontalCellGap;
      }
    }

    wasCompactable = !!childMetrics.compactable;

    let childBlockDirPos = currentBlockDirPos;

    currentBlockDirPos += vertical
      ? childMetrics.size.height
      : childMetrics.size.width;

    return {
      x: (inlineDirSize - childMetrics.size.width) * 0.5,
      y: childBlockDirPos
    };
  });

  let start = childrenMetrics[0].start;
  let end = childrenMetrics.at(-1)!.end;

  return {
    start: {
      x: childrenPos[0].x + start.x,
      y: childrenPos[0].y + start.y
    },
    end: {
      x: childrenPos.at(-1)!.x + end.x,
      y: childrenPos.at(-1)!.y + end.y
    },
    size: vertical
      ? {
        width: inlineDirSize,
        height: currentBlockDirPos
      }
      : {
        width: currentBlockDirPos,
        height: inlineDirSize
      },

    render(position, renderOptions) {
      let nodeInfos: ProtocolBlockGraphRendererNodeInfo[] = [];

      let vertical = options.settings.vertical;
      let linkDirection = vertical
        ? ('vertical' as const)
        : ('horizontal' as const);

      let children = block.children.map((_child, childIndex) => {
        let childMetrics = childrenMetrics[childIndex];
        let childPos = childrenPos[childIndex];

        let childOffset: GeometryPoint = {
          x: position.x + childPos.x,
          y: position.y + childPos.y
        };

        let childRender = childMetrics.render(childOffset, {
          attachmentEnd: (childIndex < block.children.length - 1)
            ? !linksCompact[childIndex]
            : renderOptions.attachmentEnd,
          attachmentStart: (childIndex > 0)
            ? !linksCompact[childIndex - 1]
            : renderOptions.attachmentStart
        });

        nodeInfos.push(...childRender.nodes);

        return (
          <Fragment key={childIndex}>{childRender.element}</Fragment>
        );
      });

      return {
        element: (
          <>
            {children}
            {new Array(children.length - 1).fill(0).map((_, childIndex) => {
              if (linksCompact[childIndex]) {
                return null;
              }

              let start = childrenMetrics[childIndex].end;
              let startPos = childrenPos[childIndex];

              let end = childrenMetrics[childIndex + 1].start;
              let endPos = childrenPos[childIndex + 1];

              return (
                <GraphLink
                  link={{
                    start: {
                      direction: linkDirection,
                      x: position.x + start.x + startPos.x,
                      y: position.y + start.y + startPos.y
                    },
                    end: {
                      direction: linkDirection,
                      x: position.x + end.x + endPos.x,
                      y: position.y + end.y + endPos.y
                    }
                  }}
                  settings={options.settings}
                  key={childIndex} />
              );
            })}
          </>
        ),
        nodes: nodeInfos
      };
    }
  };
};

export default {
  namespace: ('sequence' as PluginName),

  blocks: {
    ['_' as ProtocolBlockName]: {
      computeGraph,
      createPoint(block, location, child, context): Point {
        return {
          child: (child?.point ?? null),
          index: (child?.key ?? 0)
        };
      },
      getChildren(block, context) {
        return block.children.map((childBlock, index) => ({
          block: childBlock,
          delay: block.childrenDelays[index]
        }));
      },
      getChildrenExecution(block, location, context) {
        return [
          ...(new Array(location.index).fill(null)),
          { location: location.children[location.index] },
          ...(new Array(block.children.length - location.index - 1).fill(null))
        ];
      },
      getLabel(block) {
        return 'Sequence';
      }
    } satisfies PluginBlockImpl<Block, Location>
  }
} satisfies Plugin
