import { Set as ImSet } from 'immutable';
import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';

import { GraphBlockMetrics } from '../interfaces/graph';
import { Point, Size } from '../geometry';
import { ProtocolBlock } from '../interfaces/protocol';
import { Host } from '../host';
import { ContextMenuArea } from './context-menu-area';

import graphEditorStyles from '../../styles/components/graph-editor.module.scss';


export interface GraphEditorProps {
  host: Host;
  state?: unknown;
  tree: ProtocolBlock | null;
}

export interface GraphEditorState {
  animatingView: boolean;
  size: Size | null;

  offset: Point;
  scale: number;
}

export class GraphEditor extends React.Component<GraphEditorProps, GraphEditorState> {
  controller = new AbortController();
  initialized = false;
  refContainer = React.createRef<HTMLDivElement>();
  settings: GraphRenderSettings | null = null;

  observer = new ResizeObserver((_entries) => {
    if (!this.initialized) {
      this.initialized = true;
      this.setSize();
    } else {
      this.clearSize();
      this.observerDebounced();
    }
  });

  observerDebounced = util.debounce(150, () => {
    this.setSize();
  }, { signal: this.controller.signal });

  constructor(props: GraphEditorProps) {
    super(props);

    this.state = {
      animatingView: false,
      size: null,

      scale: 1,
      offset: { x: 0, y: 0 }
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

  getOffsetForScale(newScale: number, refPoint: Point, state: GraphEditorState): Point {
    let matrix = new DOMMatrix()
      .translate(state.offset.x, state.offset.y)
      .scale(state.scale)
      .translate(refPoint.x, refPoint.y)
      .scale(newScale / state.scale)
      .translate(-refPoint.x, -refPoint.y)
      .scale(1 / state.scale)
      .translate(-state.offset.x, -state.offset.y);

    return matrix.transformPoint({
      x: state.offset.x,
      y: state.offset.y
    });
  }

  componentDidMount() {
    let container = this.refContainer.current!;

    // This will immediately call setSize()
    this.observer.observe(container);

    this.controller.signal.addEventListener('abort', () => {
      this.observer.disconnect();
    });

    container.addEventListener('wheel', (event) => {
      event.preventDefault();

      let rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

      this.setState((state): any => {
        let mouseX = event.clientX - rect.left;
        let mouseY = event.clientY - rect.top;

        if (event.ctrlKey) {
          let newScale = state.scale * (1 + event.deltaY / 100);
          newScale = Math.max(0.6, Math.min(3, newScale));

          return {
            ...state,
            offset: this.getOffsetForScale(newScale, { x: mouseX, y: mouseY }, state),
            scale: newScale
          };
        } else {
          return {
            ...state,
            offset: {
              x: state.offset.x + event.deltaX * state.scale,
              y: state.offset.y + event.deltaY * state.scale
            }
          };
        }
      });
    }, { passive: false, signal: this.controller.signal });


    let styles = this.refContainer.current!.computedStyleMap();
    let cellPixelSize = CSSNumericValue.parse(styles.get('--cell-size')!).value;
    let nodeHeaderHeight = CSSNumericValue.parse(styles.get('--node-header-height')!).value;
    let nodePadding = CSSNumericValue.parse(styles.get('--node-padding')!).value;
    let nodeBodyPaddingY = CSSNumericValue.parse(styles.get('--node-body-padding-y')!).value;

    this.settings = {
      cellPixelSize,
      nodeBodyPaddingY,
      nodeHeaderHeight,
      nodePadding
    };
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  render() {
    if (!this.state.size) {
      return <div className={graphEditorStyles.root} ref={this.refContainer} />;
    }

    // console.log(this.props.tree);

    let settings = this.settings!;
    let renderedTree!: React.ReactNode | null;

    if (this.props.tree) {
      let computeMetrics = (block: ProtocolBlock) => {
        return this.props.host.units[block.namespace].graphRenderer!.computeMetrics(block, {
          computeMetrics,
          settings,
          units: this.props.host.units
        });
      };

      let render = (block: ProtocolBlock, metrics: GraphBlockMetrics, position: Point, state: unknown | null) => {
        return this.props.host.units[block.namespace].graphRenderer!.render(block, metrics, position, state, { render, settings });
      };

      let treeMetrics = computeMetrics(this.props.tree);
      renderedTree = render(this.props.tree, treeMetrics, { x: 1, y: 2 }, this.props.state ?? null);
    } else {
      renderedTree = null;
    }

    let frac = (x: number) => x - Math.floor(x);
    let offsetX = this.state.offset.x;
    let offsetY = this.state.offset.y;
    let scale = this.state.scale;

    return (
      <div className={graphEditorStyles.root} ref={this.refContainer}>
        <svg viewBox={`0 0 ${this.state.size.width} ${this.state.size.height}`} className={util.formatClass(graphEditorStyles.svg, { '_animatingView': this.state.animatingView })}>
          <defs>
            <pattern x={settings.cellPixelSize * 0.5} y={settings.cellPixelSize * 0.5} width={settings.cellPixelSize} height={settings.cellPixelSize} patternUnits="userSpaceOnUse" id="grid">
              <circle cx={settings.cellPixelSize * 0.5} cy={settings.cellPixelSize * 0.5} r="1.5" fill="#d8d8d8" />
            </pattern>
          </defs>

          <rect
            x="0" y="0"
            width={(this.state.size.width + settings.cellPixelSize) * scale}
            height={(this.state.size.height + settings.cellPixelSize) * scale}
            fill="url(#grid)"
            transform={`scale(${1 / scale}) translate(${-frac(offsetX / settings.cellPixelSize) * settings.cellPixelSize} ${-frac(offsetY / settings.cellPixelSize) * settings.cellPixelSize})`} />
          <g transform={`translate(${-offsetX / scale} ${-offsetY / scale}) scale(${1 / scale})`} onTransitionEnd={() => {
            this.setState({ animatingView: false });
          }}>
            {renderedTree}
          </g>
        </svg>
        <div className={graphEditorStyles.actionsRoot}>
          <div className={graphEditorStyles.actionsGroup}>
            <button type="button" className={graphEditorStyles.actionsButton}><Icon name="center_focus_strong" className={graphEditorStyles.actionsIcon} /></button>
          </div>
          <div className={graphEditorStyles.actionsGroup}>
            <button type="button" className={graphEditorStyles.actionsButton}><Icon name="add" className={graphEditorStyles.actionsIcon} /></button>
            <button type="button" className={graphEditorStyles.actionsButton} disabled><Icon name="remove" className={graphEditorStyles.actionsIcon} /></button>
          </div>
          <div className={graphEditorStyles.actionsGroup}>
            <button type="button" className={graphEditorStyles.actionsButton} disabled={this.state.scale === 1} onClick={() => {
              this.setState((state) => {
                let centerX = this.state.size!.width * 0.5;
                let centerY = this.state.size!.height * 0.5;

                return {
                  animatingView: true,

                  offset: this.getOffsetForScale(1, { x: centerX, y: centerY }, state),
                  scale: 1
                };
              });
            }}>Reset</button>
          </div>
        </div>
      </div>
    );
  }
}


export interface GraphRenderSettings {
  cellPixelSize: number;
  nodeBodyPaddingY: number;
  nodeHeaderHeight: number;
  nodePadding: number;
}


type GraphNodeId = string;

interface GraphNodeFeature {
  icon: string;
  label: string;
}

interface GraphNodeDef {
  id: GraphNodeId;
  title: string | null;
  features: GraphNodeFeature[];
  position: {
    x: number;
    y: number;
  };
}

export function GraphNode(props: {
  active?: unknown;
  autoMove: unknown;
  cellSize: Size;
  node: GraphNodeDef;
  onMouseDown?(event: React.MouseEvent): void;
  settings: GraphRenderSettings;
}) {
  let { node, settings } = props;

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
          createMenu={() => [
            { id: 'jump', name: 'Jump', icon: 'move_down', disabled: props.active },
            { id: 'pause', name: 'Pause process', icon: 'pause_circle', disabled: !props.active }
          ]}
          onSelect={(path) => {

          }}>
          <div
            className={util.formatClass(graphEditorStyles.node, { '_active': props.active })}
            onMouseDown={props.onMouseDown}>
            <div className={graphEditorStyles.header}>
              <div className={graphEditorStyles.title}>{node.title ? node.title : <i>Untitled</i>}</div>
            </div>
            <div className={graphEditorStyles.body}>
              {node.features.map((feature, index) => (
                <div className={graphEditorStyles.feature} key={index}>
                  <Icon name={feature.icon} />
                  <div className={graphEditorStyles.featurelabel}>{feature.label}</div>
                </div>
              ))}
            </div>
          </div>
        </ContextMenuArea>
      </foreignObject>

      <circle
        cx={settings.nodePadding}
        cy={settings.nodePadding + settings.nodeHeaderHeight * 0.5}
        r="5"
        fill="#fff"
        stroke="#000"
        strokeWidth="2" />
      <circle
        cx={settings.cellPixelSize * props.cellSize.width - settings.nodePadding}
        cy={settings.nodePadding + settings.nodeHeaderHeight * 0.5}
        r="5"
        fill="#fff"
        stroke="#000"
        strokeWidth="2" />
    </g>
  );
}


export interface GraphLinkDef {
  start: Point;
  end: Point;
}

export function GraphLink(props: {
  link: GraphLinkDef;
  settings: GraphRenderSettings;
}) {
  let { link, settings } = props;

  let startX = settings.cellPixelSize * link.start.x - settings.nodePadding;
  let startY = settings.cellPixelSize * link.start.y;

  let endX = settings.cellPixelSize * link.end.x + settings.nodePadding;
  let endY = settings.cellPixelSize * link.end.y;

  let d = `M${startX} ${startY}`;

  if (link.end.y !== link.start.y) {
    let dir = (link.start.y < link.end.y) ? 1 : -1;

    let midCellX = Math.round((link.start.x + link.end.x) * 0.5);
    let midX = settings.cellPixelSize * midCellX;

    let midStartX = settings.cellPixelSize * (midCellX - 1);
    let midEndX = settings.cellPixelSize * (midCellX + 1);

    let curveStartY = settings.cellPixelSize * (link.start.y + 1 * dir);
    let curveEndY = settings.cellPixelSize * (link.end.y - 1 * dir);

    d += `L${midStartX} ${startY}Q${midX} ${startY} ${midX} ${curveStartY}L${midX} ${curveEndY}Q${midX} ${endY} ${midEndX} ${endY}`;
  }

  d += `L${endX} ${endY}`;

  return <path d={d} className={util.formatClass(graphEditorStyles.link, { '_automove': false })} />
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
            <div className={graphEditorStyles.grouplabel}>{props.title}</div>
          </div>
        </foreignObject>
    </g>
  );
}
