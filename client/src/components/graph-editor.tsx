import { ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';
import * as React from 'react';

import graphEditorStyles from '../../styles/components/graph-editor.module.scss';

import { Icon } from './icon';
import * as util from '../util';
import { ProtocolBlockGraphRenderer, ProtocolBlockGraphRendererMetrics } from '../interfaces/graph';
import { Point, SideFlags, SideValues, Size } from '../geometry';
import { Host } from '../host';
import { ContextMenuArea } from './context-menu-area';
import { FeatureGroup } from '../components/features';
import { OverflowableText } from '../components/overflowable-text';
import { FeatureGroupDef } from '../interfaces/unit';
import { MenuDef, MenuEntryPath } from './context-menu';
import { ViewExecution } from '../views/execution';
import { UnitTools } from '../unit';
import { UnknownPluginBlockImpl } from '../interfaces/plugin';


export interface GraphEditorProps {
  execution?: ViewExecution;
  host: Host;
  selectBlock(path: ProtocolBlockPath | null, options?: { showInspector?: unknown; }): void;
  selectedBlockPath: ProtocolBlockPath | null;
  location?: unknown;
  summary?: React.ReactNode;
  tree: ProtocolBlock | null;
}

export interface GraphEditorState {
  animatingView: boolean;
  offset: Point;
  size: Size | null;
}

export class GraphEditor extends React.Component<GraphEditorProps, GraphEditorState> {
  controller = new AbortController();
  initialized = false;
  offsetBoundaries!: { min: Point; max: Point; };
  refContainer = React.createRef<HTMLDivElement>();
  settings: GraphRenderSettings | null = null;

  observer = new ResizeObserver((_entries) => {
    if (!this.initialized) {
      this.initialized = true;
      this.setSize();
    } else {
      this.observerDebounced();
    }
  });

  observerDebounced = util.debounce(500, () => {
    this.setSize();

    // this.setState((state) => ({
    //   offset: this.getBoundOffset(state.offset)
    // }));
  }, { signal: this.controller.signal });

  constructor(props: GraphEditorProps) {
    super(props);

    this.state = {
      animatingView: false,
      offset: { x: 0, y: 0 },
      size: null
    };
  }

  clearSize() {
    this.setState((state) => state.size ? { size: null } : null);
  }

  setSize() {
    let container = this.refContainer.current!;
    let rect = container.getBoundingClientRect();

    this.setState({
      size: {
        width: rect.width,
        height: rect.height
      }
    });
  }

  reveal() {
    let settings = this.settings!;

    this.setState({
      offset: {
        x: settings.cellPixelSize * 10,
        y: settings.cellPixelSize * 0
      }
    });

    // this.setState((state) => {
    //   let metrics = this.props.host.getGraphMetrics(this.props.tree!);
    //   let { width, height } = this.state.size;

    //   let scale = Math.min(
    //     width / metrics.width,
    //     height / metrics.height
    //   );

    //   let offset = {
    //     x: (width - metrics.width * scale) / 2,
    //     y: (height - metrics.height * scale) / 2
    //   };

    //   return {
    //     ...state,
    //     offset,
    //     scale
    //   };
    // });
  }

  getBoundOffset(point: Point): Point {
    return {
      x: Math.min(Math.max(point.x, this.offsetBoundaries.min.x), this.offsetBoundaries.max.x),
      y: Math.min(Math.max(point.y, this.offsetBoundaries.min.y), this.offsetBoundaries.max.y)
    };
  }

  selectBlock(path: ProtocolBlockPath | null, options?: { showInspector?: unknown; }) {
    this.props.selectBlock(path, options);
  }

  componentDidMount() {
    let container = this.refContainer.current!;

    // This will immediately call setSize().
    this.observer.observe(container);

    this.controller.signal.addEventListener('abort', () => {
      this.observer.disconnect();
    });

    container.addEventListener('wheel', (event) => {
      event.preventDefault();

      this.setState((state) => ({
        offset: this.getBoundOffset({
          x: state.offset.x + event.deltaX * 1,
          y: state.offset.y + event.deltaY * 1
        })
      }));
    }, { passive: false, signal: this.controller.signal });


    let styles = this.refContainer.current!.computedStyleMap();
    let cellPixelSize = CSSNumericValue.parse(styles.get('--cell-size')!).value;
    let nodeBorderWidth = CSSNumericValue.parse(styles.get('--node-border-width')!).value;
    let nodeHeaderHeight = CSSNumericValue.parse(styles.get('--node-header-height')!).value;
    let nodePadding = CSSNumericValue.parse(styles.get('--node-padding')!).value;
    let nodeBodyPaddingY = CSSNumericValue.parse(styles.get('--node-body-padding-y')!).value;

    this.settings = {
      editor: this,

      allowCompactActions: true,
      cellPixelSize,
      nodeBodyPaddingY,
      nodeBorderWidth,
      nodeHeaderHeight,
      nodePadding,
      vertical: true
    };
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  render() {
    if (!this.state.size) {
      return <div className={graphEditorStyles.root} ref={this.refContainer} />;
    }

    let context = { host: this.props.host };
    let settings = this.settings!;
    let renderedTree!: React.ReactNode | null;

    let getBlockImpl = (block: ProtocolBlock) => this.props.host.plugins[block.namespace].blocks[block.name];

    if (this.props.tree) {
      // console.log(this.props.tree);
      console.log('---');

      let computeGraph = (
        block: ProtocolBlock,
        path: ProtocolBlockPath,
        ancestors: ProtocolBlock[],
        location: unknown
      ): ProtocolBlockGraphRendererMetrics => {
        let blockImpl = getBlockImpl(block);

        let currentBlock = block;
        let currentBlockImpl: UnknownPluginBlockImpl;

        let discreteBlocks: ProtocolBlock[] = [];

        while (true) {
          currentBlockImpl = getBlockImpl(currentBlock);

          if (currentBlockImpl.computeGraph) {
            break;
          }

          discreteBlocks.push(currentBlock);

          // if (!currentBlockImpl.getChild) {
          //   break;
          // }

          currentBlock = currentBlockImpl.getChild!(currentBlock, 0);
        }

        // console.log(discreteBlocks, currentBlock);

        if (discreteBlocks.length > 0) {
          return computeContainerBlockGraph(({
            child: currentBlock
          } as any), [], [], null, {
            settings,
            computeMetrics(key, location) {
              return computeGraph(currentBlock, [], [...ancestors, ...discreteBlocks], null);
            },
          }, context);
        }

        let metrics = currentBlockImpl.computeGraph!(block, path, ancestors, location, {
          settings,
          computeMetrics: (key, childLocation: unknown | null) => {
            let childBlock = blockImpl.getChild!(block, key);
            return computeGraph(childBlock, [...path, key], [...ancestors, block], childLocation);
          }
        }, context);

        return metrics;
      };

      let origin: Point = { x: 1, y: 1 };
      let treeMetrics = computeGraph(this.props.tree, [], [], this.props.location ?? null);

      renderedTree = treeMetrics.render(origin, {
        attachmentEnd: false,
        attachmentStart: false
      });

      let margin = {
        bottom: 2,
        left: 1,
        right: 1,
        top: 1
      } satisfies SideValues;

      let min = {
        x: (origin.x - margin.left) * settings.cellPixelSize,
        y: (origin.y - margin.top) * settings.cellPixelSize
      } satisfies Point;

      this.offsetBoundaries = {
        min,
        max: {
          x: Math.max(min.x, (origin.x + treeMetrics.size.width + margin.right) * settings.cellPixelSize - this.state.size.width),
          y: Math.max(min.y, (origin.y + treeMetrics.size.height + margin.bottom) * settings.cellPixelSize - this.state.size.height)
        }
      };
    } else {
      renderedTree = null;
    }

    let frac = (x: number) => (x - Math.floor(x));
    let offsetX = this.state.offset.x;
    let offsetY = this.state.offset.y;

    return (
      <div className={graphEditorStyles.root} ref={this.refContainer}>
        <svg
          viewBox={`0 0 ${this.state.size.width} ${this.state.size.height}`}
          className={util.formatClass(graphEditorStyles.svg, { '_animatingView': this.state.animatingView })}
          style={{
            width: `${this.state.size.width}px`,
            height: `${this.state.size.height}px`
          }}
          onClick={() => {
            this.props.selectBlock(null);
          }}>
          <defs>
            <pattern x={settings.cellPixelSize * 0.5} y={settings.cellPixelSize * 0.5} width={settings.cellPixelSize} height={settings.cellPixelSize} patternUnits="userSpaceOnUse" id="grid">
              <circle cx={settings.cellPixelSize * 0.5} cy={settings.cellPixelSize * 0.5} r="1.5" fill="#d8d8d8" />
            </pattern>
          </defs>

          <rect
            x="0" y="0"
            width={(this.state.size.width + settings.cellPixelSize)}
            height={(this.state.size.height + settings.cellPixelSize)}
            fill="url(#grid)"
            transform={`translate(${-frac(offsetX / settings.cellPixelSize) * settings.cellPixelSize} ${-frac(offsetY / settings.cellPixelSize) * settings.cellPixelSize})`} />
          <g transform={`translate(${-offsetX} ${-offsetY})`} onTransitionEnd={() => {
            this.setState({ animatingView: false });
          }}>
            {renderedTree}
          </g>
        </svg>
        <div className={graphEditorStyles.actionsRoot}>
          <div className={graphEditorStyles.actionsGroup}>
            <button type="button" className={graphEditorStyles.actionsButton}><Icon name="center_focus_strong" className={graphEditorStyles.actionsIcon} /></button>
          </div>
          {/* <div className={graphEditorStyles.actionsGroup}>
            <button type="button" className={graphEditorStyles.actionsButton}><Icon name="add" className={graphEditorStyles.actionsIcon} /></button>
            <button type="button" className={graphEditorStyles.actionsButton} disabled><Icon name="remove" className={graphEditorStyles.actionsIcon} /></button>
          </div> */}
        </div>
        {this.props.summary && (
          <div className={graphEditorStyles.summary}>
            {this.props.summary}
          </div>
        )}
      </div>
    );
  }
}


export interface GraphRenderSettings {
  editor: GraphEditor;

  allowCompactActions: boolean;
  cellPixelSize: number;
  nodeBodyPaddingY: number;
  nodeBorderWidth: number;
  nodeHeaderHeight: number;
  nodePadding: number;
  vertical: boolean;
}


type GraphNodeId = string;

interface GraphNodeDef {
  id: GraphNodeId;
  title: {
    alternate?: boolean;
    value: string;
  } | null;
  features: FeatureGroupDef;
  position: {
    x: number;
    y: number;
  };
}

export function GraphNode(props: {
  active?: unknown;
  attachmentPoints: SideFlags;
  autoMove: unknown;
  cellSize: Size;
  createMenu(): MenuDef;
  node: GraphNodeDef;
  onMouseDown?(event: React.MouseEvent): void;
  onSelectBlockMenu(path: MenuEntryPath): void;
  path: ProtocolBlockPath;
  selected?: unknown;
  settings: GraphRenderSettings;
}) {
  let { node, settings } = props;

  let mx = settings.nodePadding + settings.nodeHeaderHeight * 0.8;
  let my = settings.nodePadding + settings.nodeHeaderHeight * 0.5;
  let attachPoints: Point[] = [];

  if (props.attachmentPoints.left) {
    attachPoints.push({ x: settings.nodePadding, y: my });
  } if (props.attachmentPoints.right) {
    attachPoints.push({ x: settings.cellPixelSize * props.cellSize.width - settings.nodePadding, y: my });
  } if (props.attachmentPoints.top) {
    attachPoints.push({ x: mx, y: settings.nodePadding });
  } if (props.attachmentPoints.bottom) {
    attachPoints.push({ x: mx, y: settings.cellPixelSize * props.cellSize.height - settings.nodePadding });
  }

  return (
    <g
      className={util.formatClass(graphEditorStyles.noderoot, { '_automove': props.autoMove })}
      transform={`translate(${settings.cellPixelSize * node.position.x} ${settings.cellPixelSize * node.position.y})`}>
      <foreignObject
        x="0"
        y="0"
        width={settings.cellPixelSize * props.cellSize.width}
        height={settings.cellPixelSize * props.cellSize.height}
        className={graphEditorStyles.nodeobject}>
        <ContextMenuArea
          createMenu={props.createMenu}
          onSelect={props.onSelectBlockMenu}>
          <div
            className={util.formatClass(graphEditorStyles.node, {
              '_active': props.active,
              '_selected': props.selected
            })}
            onClick={(event) => {
              event.stopPropagation();
              settings.editor.selectBlock(props.path);
            }}
            onDoubleClick={() => {
              settings.editor.selectBlock(props.path, { showInspector: true });
            }}
            onMouseDown={props.onMouseDown}>
            {node.title && (
              <div className={graphEditorStyles.header}>
                <div className={graphEditorStyles.title} title={node.title.value}>{node.title.alternate ? <i>{node.title.value}</i> : node.title.value}</div>
              </div>
            )}
            <div className={graphEditorStyles.body}>
              <FeatureGroup group={node.features} />
            </div>
          </div>
        </ContextMenuArea>
      </foreignObject>

      {attachPoints.map((attachPoint, index) => (
        <circle
          cx={attachPoint.x}
          cy={attachPoint.y}
          r="5"
          fill="#fff"
          stroke="#000"
          strokeWidth="2"
          key={index} />
      ))}
    </g>
  );
}


export interface GraphLinkDef {
  start: GraphLinkPoint;
  end: GraphLinkPoint;
}

export interface GraphLinkPoint extends Point {
  direction: 'horizontal' | 'vertical' | null;
}

export function GraphLink(props: {
  link: GraphLinkDef;
  settings: GraphRenderSettings;
}) {
  let { link, settings } = props;

  let startX = settings.cellPixelSize * link.start.x;
  let startY = settings.cellPixelSize * link.start.y;

  switch (link.start.direction) {
    case 'horizontal':
      startX -= settings.nodePadding;
      startY += settings.cellPixelSize;
      break;

    case 'vertical':
      startX += settings.nodePadding + (settings.nodeHeaderHeight * 0.8);
      startY -= settings.nodePadding;
      break;
  }

  let endX = settings.cellPixelSize * link.end.x;
  let endY = settings.cellPixelSize * link.end.y;

  switch (link.end.direction) {
    case 'horizontal':
      endX += settings.nodePadding;
      endY += settings.cellPixelSize;
      break;
    case 'vertical':
      endX += settings.nodePadding + (settings.nodeHeaderHeight * 0.8);
      endY += settings.nodePadding;
      break;
  }

  let d = `M${startX} ${startY}`;

  // if (link.end.y !== link.start.y) {
  //   let dir = (link.start.y < link.end.y) ? 1 : -1;

  //   let midCellX = Math.round((link.start.x + link.end.x) * 0.5);
  //   let midX = settings.cellPixelSize * midCellX;

  //   let midStartX = settings.cellPixelSize * (midCellX - 1);
  //   let midEndX = settings.cellPixelSize * (midCellX + 1);

  //   let curveStartY = settings.cellPixelSize * (link.start.y + 1 * dir);
  //   let curveEndY = settings.cellPixelSize * (link.end.y - 1 * dir);

  //   d += `L${midStartX} ${startY}Q${midX} ${startY} ${midX} ${curveStartY}L${midX} ${curveEndY}Q${midX} ${endY} ${midEndX} ${endY}`;
  // }

  d += `L${endX} ${endY}`;

  return <path d={d} className={graphEditorStyles.link} />
}


export function NodeContainer(props: {
  cellSize: Size;
  position: Point;
  settings: GraphRenderSettings;
  title: React.ReactNode;
}) {
  let { settings } = props;

  return (
    <g className={graphEditorStyles.group}>
      <foreignObject
        x={settings.cellPixelSize * props.position.x}
        y={settings.cellPixelSize * props.position.y}
        width={settings.cellPixelSize * props.cellSize.width}
        height={settings.cellPixelSize * props.cellSize.height}
        className={graphEditorStyles.groupobject}>
          <div className={graphEditorStyles.group}>
            <OverflowableText>
              <div className={graphEditorStyles.grouplabel}>{props.title}</div>
            </OverflowableText>
          </div>
        </foreignObject>
    </g>
  );
}


const computeContainerBlockGraph: ProtocolBlockGraphRenderer<ProtocolBlock, 0> = (block, path, ancestors, location, options, context) => {
  let childMetrics = options.computeMetrics(0, null);

  let size = {
      width: childMetrics.size.width + 2,
      height: childMetrics.size.height + 3
    }

  return {
    start: {
      x: childMetrics.start.x + 1,
      y: childMetrics.start.y + 2
    },
    end: {
      x: childMetrics.end.x + 1,
      y: childMetrics.end.y + 2
    },
    size,

    render(position, renderOptions) {
      // let label = (block.state['name'] as { value: string | null; }).value;

      return (
        <>
          <NodeContainer
            cellSize={size}
            position={position}
            settings={options.settings}
            title={'Hello'} />
          {childMetrics.render({
            x: position.x + 1,
            y: position.y + 2
          }, renderOptions)}
        </>
      );
    }
  }
};
