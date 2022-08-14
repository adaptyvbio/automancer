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
      return <div ref={this.refContainer} />;
    }

    let cellSize = 30;
    let cellCountX = Math.floor(this.state.size.width / cellSize);
    let cellCountY = Math.floor(this.state.size.height / cellSize);

    let nodeOverflow = 15;
    let nodeWidth = 8;

    return (
      <div ref={this.refContainer}>
        <svg viewBox={`0 0 ${this.state.size.width} ${this.state.size.height}`} style={{ backgroundColor: '#f1f1f1' }}>
          <g>
            {new Array(cellCountX * cellCountY).fill(0).map((_, index) => {
              let x = index % cellCountX;
              let y = Math.floor(index / cellCountX);
              return <circle cx={x * cellSize} cy={y * cellSize} r="1.5" fill="#d8d8d8" key={index} />;
            })}
          </g>

          {this.state.nodes.map((node) => (
            <React.Fragment key={node.id}>
              <foreignObject
                x={cellSize * node.position.x - nodeOverflow}
                y={cellSize * node.position.y - nodeOverflow}
                width={cellSize * nodeWidth + nodeOverflow * 2}
                height={cellSize * 5 + nodeOverflow * 2}
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
                cx={cellSize * (node.position.x + nodeWidth) + nodeOverflow - 1}
                cy={cellSize * node.position.y - nodeOverflow + 1 + 20}
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

          <path d={`M${cellSize * 10} ${cellSize * 12}L${cellSize * 12} ${cellSize * 12}Q${cellSize * 13} ${cellSize * 12} ${cellSize * 13} ${cellSize * 11}L${cellSize * 13} ${cellSize * 8}`} fill="none" stroke="#000" strokeLinecap="round" strokeWidth="2" />
          <path d={`M${cellSize * 10} ${cellSize * 12}L${cellSize * 15} ${cellSize * 12}`} stroke="#f1f1f1" strokeLinecap="round" strokeWidth="5" />
          <path d={`M${cellSize * 10} ${cellSize * 12}L${cellSize * 15} ${cellSize * 12}`} stroke="#000" strokeLinecap="round" strokeWidth="2" />
        </svg>
      </div>
    );
  }
}
