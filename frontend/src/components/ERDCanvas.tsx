import { useCallback, useEffect } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  MarkerType,
  NodeProps,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useEntityStore } from '../stores/entityStore'
import { Entity, Relationship, RelationType } from '../types'

function ERDNode({ data }: NodeProps<Entity>) {
  return (
    <div className="bg-white rounded-lg shadow-lg border-2 border-primary-500 min-w-[220px] text-xs">
      <Handle type="target" position={Position.Left} />
      <div className="bg-primary-600 text-white px-3 py-1.5 rounded-t-md">
        <div className="font-bold">{data.name}</div>
        <div className="text-primary-200 font-mono">{data.tableName}</div>
      </div>
      <div className="divide-y divide-gray-100">
        {data.attributes.map((attr) => (
          <div key={attr.id} className="flex items-center px-3 py-1 gap-2">
            <span
              className={
                attr.isPrimary
                  ? 'text-yellow-500 font-bold w-5'
                  : attr.isForeign
                  ? 'text-blue-500 w-5'
                  : 'text-gray-300 w-5'
              }
            >
              {attr.isPrimary ? 'PK' : attr.isForeign ? 'FK' : ''}
            </span>
            <span className="flex-1 font-medium text-gray-700">{attr.name}</span>
            <span className="text-gray-400 font-mono">{attr.type}</span>
            {attr.isNullable && !attr.isPrimary && <span className="text-gray-300">?</span>}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { erdEntity: ERDNode }

const REL_LABEL: Record<RelationType, string> = {
  ONE_TO_ONE: '1:1',
  ONE_TO_MANY: '1:N',
  MANY_TO_ONE: 'N:1',
  MANY_TO_MANY: 'N:M',
}

function entitiesToNodes(entities: Entity[]): Node<Entity>[] {
  return entities.map((e) => ({
    id: e.id,
    type: 'erdEntity',
    position: e.position,
    data: e,
  }))
}

function relationshipsToEdges(relationships: Relationship[]): Edge[] {
  return relationships.map((r) => ({
    id: r.id,
    source: r.sourceEntityId,
    target: r.targetEntityId,
    label: REL_LABEL[r.type],
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 1.5 },
    animated: r.type === 'MANY_TO_MANY',
  }))
}

export default function ERDCanvas() {
  const { entities, relationships, updateEntity, addRelationship, removeRelationship } =
    useEntityStore()

  const [nodes, setNodes, onNodesChange] = useNodesState<Entity>(entitiesToNodes(entities))
  const [edges, setEdges, onEdgesChange] = useEdgesState(relationshipsToEdges(relationships))

  useEffect(() => {
    setNodes(entitiesToNodes(entities))
  }, [entities, setNodes])

  useEffect(() => {
    setEdges(relationshipsToEdges(relationships))
  }, [relationships, setEdges])

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      updateEntity(node.id, { position: node.position })
    },
    [updateEntity]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addRelationship({
          sourceEntityId: connection.source,
          targetEntityId: connection.target,
          type: 'ONE_TO_MANY',
        })
      }
    },
    [addRelationship]
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      deleted.forEach((e) => removeRelationship(e.id))
    },
    [removeRelationship]
  )

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode="Delete"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}
