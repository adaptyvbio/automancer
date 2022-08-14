import * as React from 'react';
import { Icon } from './icon';


interface Node {
  id: string;
  title: string;
  features: {
    icon: string;
    label: string;
  }[];
  position: {
    x: number;
    y: number;
  };
}


export interface GraphEditorProps {

}

export interface GraphEditorState {
  nodes: Node[];
  size: {
    width: number;
    height: number;
  } | null;
}

export class GraphEditor extends React.Component<GraphEditorProps, GraphEditorState> {
  refContainer = React.createRef<HTMLDivElement>();

  constructor(props: GraphEditorProps) {
    super(props);

    this.state = {
      nodes: [
        {
          id: '0',
          title: 'Wash',
          features: [
            { icon: 'hourglass_empty', label: '10 min' },
            { icon: 'air', label: 'Neutravidin' }
          ],
          position: {
            x: 3,
            y: 5
          }
        },
        {
          id: '1',
          title: 'Wash',
          features: [
            { icon: 'hourglass_empty', label: '10 min' },
            { icon: 'air', label: 'Neutravidin' }
          ],
          position: {
            x: 18,
            y: 2
          }
        }
      ],
      size: null
    };
  }

  componentDidMount() {
    let container = this.refContainer.current!;
    let rect = container.getBoundingClientRect();

    this.setState({
      size: {
        width: rect.width,
        height: rect.height
      }
    });
  }

  render() {
    if (!this.state.size) {
      return <div className="geditor-root" ref={this.refContainer} />;
    }

    let styles = this.refContainer.current!.computedStyleMap();
    // console.log(Object.fromEntries(Array.from(styles)));
    let cellSize = CSSNumericValue.parse(styles.get('--cell-size')!).value;
    let nodeHeaderHeight = CSSNumericValue.parse(styles.get('--node-header-height')!).value;
    let nodePadding = CSSNumericValue.parse(styles.get('--node-padding')!).value;

    let cellCountX = Math.floor(this.state.size.width / cellSize);
    let cellCountY = Math.floor(this.state.size.height / cellSize);

    let nodeWidth = Math.round((220 + nodePadding * 2) / cellSize);
    let nodeHeight = Math.ceil((nodeHeaderHeight + 80 + nodePadding * 2) / cellSize);

    let link = {
      start: { x: 11, y: 6 },
      end: { x: 18, y: 3 }
    };

    let settings = {
      cellSize,
      nodeHeaderHeight,
      nodePadding,
      nodeWidth,
      nodeHeight
    };

    return (
      <div className="geditor-root" ref={this.refContainer}>
        <svg viewBox={`0 0 ${this.state.size.width} ${this.state.size.height}`} className="geditor-svg">
          <g>
            {new Array(cellCountX * cellCountY).fill(0).map((_, index) => {
              let x = index % cellCountX;
              let y = Math.floor(index / cellCountX);
              return <circle cx={x * cellSize} cy={y * cellSize} r="1.5" fill="#d8d8d8" key={index} />;
            })}
          </g>

          <Link link={link} settings={settings} />

          {this.state.nodes.map((node) => (
            <React.Fragment key={node.id}>
              <foreignObject
                x={cellSize * node.position.x}
                y={cellSize * node.position.y}
                width={cellSize * nodeWidth}
                height={cellSize * nodeHeight}
                className="geditor-nodeobject">
                <div className="geditor-node">
                  <div className="geditor-header">
                    <div className="geditor-title">{node.title}</div>
                  </div>
                  <div className="geditor-body">
                    {node.features.map((feature, index) => (
                      <div className="geditor-feature" key={index}>
                        <Icon name={feature.icon} />
                        <div className="geditor-featurelabel">{feature.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </foreignObject>

              <circle
                cx={cellSize * node.position.x + nodePadding}
                cy={cellSize * node.position.y + nodePadding + nodeHeaderHeight * 0.5}
                r="5"
                fill="#fff"
                stroke="#000"
                strokeWidth="2" />
              <circle
                cx={cellSize * (node.position.x + nodeWidth) - nodePadding}
                cy={cellSize * node.position.y + nodePadding + nodeHeaderHeight * 0.5}
                r="5"
                fill="#fff"
                stroke="#000"
                strokeWidth="2" />
            </React.Fragment>
          ))}
          {/* <foreignObject
            x={cellSize * 5 - nodeOverflow}
            y={cellSize * 2 - nodeOverflow}
            width={cellSize * 8 + nodeOverflow * 2}
            height={cellSize * 5 + nodeOverflow * 2}
            className="geditor-nodeobject">
            <div className="geditor-node">
              <div className="geditor-header">
                <div className="geditor-title">Wash</div>
              </div>
              <div className="geditor-body">
                <div className="geditor-feature">
                  <Icon name="hourglass_empty" />
                  <div className="geditor-featurelabel">100 ms</div>
                </div>
                <div className="geditor-feature">
                  <Icon name="air" />
                  <div className="geditor-featurelabel">Biotin</div>
                </div>
              </div>
            </div>
          </foreignObject> */}

          {/* <path d={`M${cellSize * 10} ${cellSize * 12}L${cellSize * 12} ${cellSize * 12}Q${cellSize * 13} ${cellSize * 12} ${cellSize * 13} ${cellSize * 11}L${cellSize * 13} ${cellSize * 8}`} fill="none" stroke="#000" strokeLinecap="round" strokeWidth="2" />
          <path d={`M${cellSize * 10} ${cellSize * 12}L${cellSize * 15} ${cellSize * 12}`} stroke="#f1f1f1" strokeLinecap="round" strokeWidth="5" />
          <path d={`M${cellSize * 10} ${cellSize * 12}L${cellSize * 15} ${cellSize * 12}`} stroke="#000" strokeLinecap="round" strokeWidth="2" /> */}
        </svg>
      </div>
    );
  }
}


interface LinkIntf {
  start: { x: number; y: number; };
  end: { x: number; y: number; };
}

interface Settings {
  cellSize: number;
  nodeHeaderHeight: number;
  nodePadding: number;
  nodeWidth: number;
  nodeHeight: number;
}

function Link(props: {
  link: LinkIntf;
  settings: Settings;
}) {
  let { link, settings } = props;

  let startX = settings.cellSize * link.start.x - settings.nodePadding;
  let startY = settings.cellSize * link.start.y;

  let endX = settings.cellSize * link.end.x + settings.nodePadding;;
  let endY = settings.cellSize * link.end.y;

  let d = `M${startX} ${startY}`;

  if (link.end.y !== link.start.y) {
    let dir = (link.start.y < link.end.y) ? 1 : -1;

    let midCellX = Math.round((link.start.x + link.end.x) * 0.5);
    let midX = settings.cellSize * midCellX;

    let midStartX = settings.cellSize * (midCellX - 1);
    let midEndX = settings.cellSize * (midCellX + 1);

    let curveStartY = settings.cellSize * (link.start.y + 1 * dir);
    let curveEndY = settings.cellSize * (link.end.y - 1 * dir);

    // d += `L${midX} ${startY}L${midX} ${endY}`;
    d += `L${midStartX} ${startY}Q${midX} ${startY} ${midX} ${curveStartY}L${midX} ${curveEndY}Q${midX} ${endY} ${midEndX} ${endY}`;
    // d += `L${midStartX} ${startY}q${settings.cellSize} 0 ${settings.cellSize} ${settings.cellSize}L${midX} ${curveEndY}q0 ${settings.cellSize} ${settings.cellSize} ${settings.cellSize}`;
    // d += `L${midStartX} ${startY}q${cellSize} 0 ${cellSize} ${cellSize}L${midX} ${curveEndY}q0 ${cellSize} ${cellSize} ${cellSize}`;
  }

  d += `L${endX} ${endY}`;

  return <path d={d} fill="none" stroke="#000" strokeLinecap="round" strokeWidth="2" />
}
