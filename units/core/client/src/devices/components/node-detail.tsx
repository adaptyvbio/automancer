import * as d3 from 'd3';
import * as fc from 'd3fc';
import { Button, StaticSelect } from 'pr1';
import { Component, ReactNode, createRef } from 'react';

import styles from '../styles.module.scss';

import { BaseNode, Context, ExecutorState, NodePath, NodeState, namespace } from '../types';
import { isValueNode } from '../util';
import { NumericValue } from '../types';
import { formatQuantity } from '../format';


export interface WindowOption {
  label: string;
  value: number;
}

export const ChartWindowOptions: WindowOption[] = [
  { label: '1 sec', value: 1e3 },
  { label: '10 sec', value: 10e3 },
  { label: '1 min', value: 60e3 },
  { label: '10 min', value: (10 * 60e3) }
];



export interface NodeDetailProps {
  context: Context;
  executor: ExecutorState;
  node: BaseNode;
  nodePath: NodePath;
  nodeState: NodeState;
}

export interface NodeDetailState {
  chartReady: boolean;
  chartWindowOption: WindowOption;
}

export class NodeDetail extends Component<NodeDetailProps, NodeDetailState> {
  private chart: any;
  private data: [number, number][] = [];
  private chartRenderId: number | null = null;
  private refChart = createRef<HTMLDivElement>();

  private previousDisplayWindow = 0;
  private minSampleCount = 4;
  private storageWindow = 30 * 60e3;

  constructor(props: NodeDetailProps) {
    super(props);

    this.state = {
      chartReady: false,
      chartWindowOption: ChartWindowOptions[1]
    };

    let xScale = d3.scaleLinear();
    let yScale = d3.scaleLinear();

    let series1 = fc
      .seriesWebglLine()
      .mainValue((d) => d[1])
      .crossValue((d) => d[0])
      .decorate((program, data) => {
        fc.webglStrokeColor()
          .value((_, i) => [0x00 / 0xff, 0x74 / 0xff, 0xd9 / 0xff, 1])
          .data(data)(program);
      });

    this.chart = fc
      .chartCartesian(xScale, yScale)
      .webglPlotArea(
        fc.seriesWebglMulti()
          .series([series1])
          .mapping((data, index, series) => data)
      );
  }

  override componentDidUpdate(prevProps: Readonly<NodeDetailProps>, prevState: Readonly<NodeDetailState>, snapshot?: any) {
    // console.log(this.props.nodeState);

    if (isValueNode(this.props.node) && (this.props.node.spec.type === 'numeric') && (this.props.nodeState.value?.value?.type === 'default')) {
      let newTime = this.props.nodeState.value.time;
      let newValue = this.props.nodeState.value.value.value.magnitude;

      if ((this.data.length < 1) || (newTime !== this.data.at(-1)[0])) {
        this.data.push([newTime, newValue]);
        this.controlChartRender();
      }
    }

    if (this.state.chartReady && !prevState.chartReady) {
      let render = () => {
        this.renderChart();
        this.chartRenderId = requestAnimationFrame(render);
      };

      this.chartRenderId = requestAnimationFrame(render);
    }
  }

  override componentWillUnmount() {
    this.cancelChartRender();
  }

  cancelChartRender() {
    if (this.chartRenderId !== null) {
      cancelAnimationFrame(this.chartRenderId);
      this.chartRenderId = null;
    }
  }

  controlChartRender() {
    let now = Date.now();

    let sliceIndex = this.data.findIndex(([time, value]) => time > (now - this.storageWindow));
    this.data.splice(0, (sliceIndex >= 0) ? (sliceIndex - 1) : this.data.length);

    if (this.data.length >= this.minSampleCount) {
      if (!this.state.chartReady) {
        this.setState({ chartReady: true });
      }
    } else {
      if (this.state.chartReady) {
        this.setState({ chartReady: false });
        this.cancelChartRender();
      }
    }
  }

  renderChart() {
    let displayWindow = this.state.chartWindowOption.value;

    let now = Date.now();
    let data = this.data.map(([time, value]) => [(time - now), value]);

    let firstIncludedIndex = data.findIndex(([delta, value]) => -delta < displayWindow);
    data = (firstIncludedIndex >= 0)
      ? data.slice(Math.max(0, firstIncludedIndex - 1))
      : [];

    let values = data.map(([delta, value]) => value);
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    let diff = maxValue - minValue;

    minValue -= diff * 0.05;
    maxValue += diff * 0.05;

    this.chart
      .yDomain([minValue, maxValue])
      // .yTickFormat((value, index) => `${value.toFixed(2)} MB`);


    if (displayWindow !== this.previousDisplayWindow) {
      this.previousDisplayWindow = displayWindow;

      this.chart
        .xDomain([-displayWindow, 0])
        .xTickFormat((delta: number) => {
          let minutes = Math.floor(-delta / 60e3);
          let seconds = Math.round((-delta - minutes * 60e3) / 1e3);

          return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        });
    }


    d3.select(this.refChart.current!)
      .datum(data)
      .call(this.chart);
  }

  override render() {
    let { node, nodePath, nodeState } = this.props;

    let owner = nodeState.writable?.owner;
    let owned = (owner?.type === 'client') && (owner.clientId === this.props.context.host.clientId);

    return (
      <div className={styles.detailRoot} key={nodePath.join('.')}>
        <div className={styles.detailContents}>
          <div className={styles.detailHeaderRoot}>
            <div className={styles.detailHeaderTitle}>
              <h1 className={styles.detailHeaderLabel}>{node.label ?? node.id}</h1>
              <p className={styles.detailHeaderDescription}>{node.description ?? ' '}</p>
            </div>
            <div className={styles.detailHeaderActions}>
              {nodeState.writable && (
                <Button onClick={() => {
                  this.props.context.pool.add(async () => {
                    await this.props.context.host.client.request({
                      type: 'requestExecutor',
                      namespace,
                      data: {
                        type: (owned ? 'release' : 'claim'),
                        nodePath: nodePath.toJS()
                      }
                    })
                  });
                }}>{owned ? 'Release' : 'Claim'}</Button>
              )}
              <Button onClick={() => {}}>Pin</Button>
            </div>
          </div>
          <div className={styles.detailInfoRoot}>
            <div className={styles.detailInfoEntry}>
              <div className={styles.detailInfoLabel}>Full name</div>
              <div className={styles.detailInfoValue}>
                <code>{nodePath.join('.')}</code>
              </div>
            </div>
            <div className={styles.detailInfoEntry}>
              <div className={styles.detailInfoLabel}>Status</div>
              <div className={styles.detailInfoValue}>
                {nodeState.connected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
            {false && nodeState.writable && (
              <div className={styles.detailInfoEntry}>
                <div className={styles.detailInfoLabel}>Current user</div>
                <div className={styles.detailInfoValue}>{(() => {
                  if (!owner) {
                    return '–';
                  } if (owned) {
                    return 'You';
                  } if (owner.type === 'client') {
                    return 'Another client';
                  }

                  return '[Unknown]';
                })()}</div>
              </div>
            )}
            {/* <div className={styles.detailConnectionRoot}>
                      <div className={styles.detailConnectionStatus}>
                        <Icon name="error" style="sharp" />
                        <div>Disconnected</div>
                      </div>
                      <p className={styles.detailConnectionMessage}>The device is disconnected.</p>
                    </div> */}
          </div>
          {/* <div className={styles.detailChartRoot}>
            <div className={styles.detailChartToolbar}>
              <StaticSelect
                options={ChartWindowOptions}
                selectOption={(chartWindowOption) => void this.setState({ chartWindowOption })}
                selectedOption={this.state.chartWindowOption}>
                Window: {this.state.chartWindowOption.label}
              </StaticSelect>
            </div>
            <div className={styles.detailChartContainer}>
              {this.state.chartReady
                ? (
                  <div className={styles.detailChartContents} ref={this.refChart} key={0} />
                )
                : (
                  <div className={styles.detailChartPlaceholder} key={1}>
                    <p>Gathering samples...</p>
                  </div>
                )}
            </div>
          </div> */}
          {isValueNode(node) && (
            <div className={styles.detailValues}>
              <div className={styles.detailValueRoot}>
                <div className={styles.detailValueLabel}>{nodeState.connected ? 'Current value' : 'Last known value'}</div>
                <div className={styles.detailValueQuantity}>
                  {(() => {
                    let lastValueEvent = nodeState.lastValueEvent;

                    let magnitude: ReactNode;
                    let unit: ReactNode | null = null;

                    if (!lastValueEvent?.value) {
                      // The value is unknown.
                      magnitude = '–';
                    } else if (lastValueEvent.value.type === 'null') {
                      // The device is disabled.
                      magnitude = '[disabled]';
                    } else {
                      switch (node.spec.type) {
                        case 'numeric':
                          [magnitude, unit] = formatQuantity((lastValueEvent.value.innerValue as NumericValue).magnitude, node.spec.dimensionality, { sign: true, style: 'short' });
                          break;
                        default:
                          magnitude = '[unknown]';
                          break;
                      }
                    }

                    return (
                      <>
                        <div className={styles.detailValueMagnitude}>{magnitude}</div>
                        {unit && <div className={styles.detailValueUnit}>{unit}</div>}
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className={styles.detailValueRoot}>
                <div className={styles.detailValueLabel}>Target value</div>
                <div className={styles.detailValueQuantity}>
                  <div className={styles.detailValueMagnitude} contentEditable={false}>34.7</div>
                  <div className={styles.detailValueUnit}>ºC</div>
                </div>
                <p className={styles.detailValueError}>The target value must be in the range 15.2 – 34.7ºC.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
