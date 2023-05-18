import { PluginViewComponentProps } from 'pr1';

import { Map as ImMap, List } from 'immutable';
import { TitleBar } from 'pr1';
import { ChannelId } from 'pr1-shared';
import { useEffect, useState } from 'react';

import styles from './styles.module.scss';

import { NodeDetail } from './components/node-detail';
import { NodeHierarchy } from './components/node-hierarchy';
import { BaseNode, Context, ExecutorState, NodeId, NodePath, NodeState, namespace } from './types';
import { findNode, isCollectionNode } from './util';


// type PersistentStoreEntries = [
//   [['plugin', typeof namespace, 'selected-entry'], NodePath | null]
// ];


export function DeviceControlView(props: PluginViewComponentProps<Context>) {
  let executor = (props.context.host.state.executors[namespace] as ExecutorState);

  let [selectedNodePath, setSelectedNodePath] = props.context.store.useSession('selectedNodePath');
  let [nodeStates, setNodeStates] = useState<ImMap<NodePath, NodeState> | null>(null);

  useEffect(() => {
    props.context.pool.add(async () => {
      let { channelId } = (await props.context.host.client.request({
        type: 'requestExecutor',
        namespace,
        data: {
          type: 'listen'
        }
      }) as { channelId: ChannelId; });

      let channel = props.context.host.client.listen<[NodeId[], NodeState][], {}>(channelId);

      for await (let change of channel) {
        setNodeStates((nodeStates) => (nodeStates ?? ImMap()).withMutations((nodeStatesMut) => {
          for (let [nodePath, nodeState] of change) {
            nodeStatesMut.set(List(nodePath), nodeState);
          }
        }));
      }

      return () => {
        channel.send({});
        channel.close();
      };
    });
  }, []);

  return (
    <>
      <TitleBar title="Device control" />
      <div className={styles.root}>
        <div className={styles.list}>
          <NodeHierarchy
            context={props.context}
            nodes={Object.values(executor.root.nodes)} />
        </div>
        {(() => {
          if (!selectedNodePath || !nodeStates) {
            return null;
          }

          let nodePath = selectedNodePath;
          let node = findNode(executor.root, nodePath);

          if (!node) {
            setSelectedNodePath(null);
            return null;
          }

          let nodeState = nodeStates.get(nodePath)!;

          return (
            <NodeDetail
              context={props.context}
              executor={executor}
              node={node}
              nodePath={nodePath}
              nodeState={nodeState}
              key={nodePath.join('.')} />
          );
        })()}

      </div>
    </>
  )
}
