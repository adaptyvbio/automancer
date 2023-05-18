import { BaseNode, CollectionNode, NodePath, ValueNode } from './types';


export function findNode(node: BaseNode, path: NodePath) {
  let currentNode = node;

  for (let id of path) {
    if (!isCollectionNode(currentNode)) {
      return null;
    }

    currentNode = currentNode.nodes[id];

    if (!currentNode) {
      return null;
    }
  }

  return currentNode;
}

export function isCollectionNode(node: BaseNode): node is CollectionNode {
  return 'nodes' in node;
}

export function isValueNode(node: BaseNode): node is ValueNode {
  return 'spec' in node;
}
