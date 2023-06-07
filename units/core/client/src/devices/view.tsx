import { Map as ImMap, List } from 'immutable';
import { ErrorBoundary, PluginViewComponentProps, TitleBar } from 'pr1';
import { ChannelId } from 'pr1-shared';
import { useEffect, useState } from 'react';

import styles from './styles.module.scss';

import { NodeDetail } from './components/node-detail';
import { NodeHierarchy } from './components/node-hierarchy';
import { Context, ExecutorState, NodeId, NodePath, NodeState, NodeStateChange, NodeStates, namespace } from './types';
import { findNode } from './util';


export function DeviceControlView(props: PluginViewComponentProps<Context>) {
  let executor = (props.context.host.state.executors[namespace] as ExecutorState);

  let [selectedNodePath, setSelectedNodePath] = props.context.store.useSession('selectedNodePath');
  let [nodeStates, setNodeStates] = useState<NodeStates | null>(null);

  useEffect(() => {
    let controller = new AbortController();

    props.context.pool.add(async () => {
      let { channelId } = (await props.context.requestToExecutor({
        type: 'listen'
      })) as { channelId: ChannelId; };

      let channel = props.context.host.client.listen<[NodeId[], NodeStateChange][], {}>(channelId);

      controller.signal.addEventListener('abort', () => {
        channel.send({});
        channel.close();
      });

      for await (let nodeStateChanges of channel) {
        setNodeStates((nodeStates) => (nodeStates ?? ImMap<NodePath, NodeState>()).merge(ImMap<NodePath, NodeState>(
          nodeStateChanges.map(([rawNodePath, nodeStateChange]) => {
            let nodePath = List(rawNodePath);
            let nodeState = nodeStates?.get(nodePath);

            return [nodePath, {
              connected: nodeStateChange.connected,
              history: (nodeState?.history ?? []),
              lastValueEvent: nodeStateChange.valueEvent,
              writer: nodeStateChange.writer
            }];
          })
        )));
      }
    });

    return () => void controller.abort();
  }, []);

  return (
    <>
      <TitleBar title="Device control" />
      <div className={styles.root}>
        <div className={styles.list}>
          <NodeHierarchy
            context={props.context}
            nodeStates={nodeStates}
            rootNode={executor.root} />
        </div>
        {(() => {
          if (!selectedNodePath || !nodeStates) {
            return null;
          }

          let node = findNode(executor.root, selectedNodePath);

          if (!node) {
            setSelectedNodePath(null);
            return null;
          }

          let nodeState = nodeStates.get(selectedNodePath)!;

          return (
            <ErrorBoundary>
              <NodeDetail
                context={props.context}
                executor={executor}
                node={node}
                nodePath={selectedNodePath}
                nodeState={nodeState}
                key={selectedNodePath.join('.')} />
            </ErrorBoundary>
          );
        })()}

      </div>
    </>
  )
}
