import { useCallback, useEffect } from 'react'
import Dagre from '@dagrejs/dagre'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getRectOfNodes,
  getTransformForBounds,
  Connection,
  MarkerType,
  NodeProps,
  EdgeProps,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
} from 'reactflow'
import { toPng } from 'html-to-image'
import toast from 'react-hot-toast'
import 'reactflow/dist/style.css'
import { useEntityStore } from '../stores/entityStore'
import { useProjectStore } from '../stores/projectStore'
import { Entity, Relationship, RelationType } from '../types'

function ERDNode({ data }: NodeProps<Entity>) {
  return (
    <div className="bg-white rounded-lg shadow-lg border-2 border-primary-500 min-w-[220px] text-xs">
      {/* Handle은 호버 시에만 표시하여 드래그 중 실수로 잡히는 것을 방지 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!opacity-0 hover:!opacity-100 !w-3 !h-3 !transition-opacity"
      />
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
      <Handle
        type="source"
        position={Position.Right}
        className="!opacity-0 hover:!opacity-100 !w-3 !h-3 !transition-opacity"
      />
    </div>
  )
}

// 관계 엣지: EdgeLabelRenderer(HTML 포털)로 레이블 렌더링 → 이미지 내보내기 시 정상 캡처
function RelationshipEdge({
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  label, markerEnd, style,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono font-semibold text-gray-700 shadow-sm"
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = { erdEntity: ERDNode }
const edgeTypes = { relationship: RelationshipEdge }

const IMAGE_PADDING = 60

// dagre로 계층적 레이아웃 계산
function calcDagreLayout(nodes: Node[], edges: Edge[], dir: 'LR' | 'TB' = 'LR') {
  const g = new Dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: dir, nodesep: 80, ranksep: 140, marginx: 60, marginy: 60 })

  nodes.forEach((n) => {
    g.setNode(n.id, { width: n.width ?? 240, height: n.height ?? 180 })
  })
  edges.forEach((e) => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target)
    }
  })

  Dagre.layout(g)

  return nodes.map((n) => {
    const { x, y } = g.node(n.id)
    return { ...n, position: { x: x - (n.width ?? 240) / 2, y: y - (n.height ?? 180) / 2 } }
  })
}

function AutoLayoutButton() {
  const { getNodes, getEdges, fitView } = useReactFlow()
  const { updateEntity } = useEntityStore()

  const handleLayout = useCallback((dir: 'LR' | 'TB') => {
    const nodes = getNodes()
    const edges = getEdges()
    if (nodes.length === 0) return

    const layouted = calcDagreLayout(nodes, edges, dir)
    layouted.forEach((n) => updateEntity(n.id, { position: n.position }))
    // 포지션 상태 전파 후 fitView (CSS transition 0.45s와 맞춤)
    setTimeout(() => fitView({ duration: 500, padding: 0.12 }), 50)
  }, [getNodes, getEdges, updateEntity, fitView])

  return (
    <div className="flex gap-1">
      <button
        onClick={() => handleLayout('LR')}
        title="좌→우 자동 정렬"
        className="bg-white border border-gray-300 text-gray-600 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-gray-50 hover:border-primary-400 hover:text-primary-600 shadow-sm transition-colors"
      >
        ↔ 정렬
      </button>
      <button
        onClick={() => handleLayout('TB')}
        title="위→아래 자동 정렬"
        className="bg-white border border-gray-300 text-gray-600 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-gray-50 hover:border-primary-400 hover:text-primary-600 shadow-sm transition-colors"
      >
        ↕ 정렬
      </button>
    </div>
  )
}

function ExportButton() {
  const { getNodes } = useReactFlow()
  const { name } = useProjectStore()

  const handleExport = useCallback(async () => {
    const nodes = getNodes()
    if (nodes.length === 0) {
      toast.error('내보낼 엔티티가 없습니다.')
      return
    }

    const bounds = getRectOfNodes(nodes)
    const imageWidth = Math.max(bounds.width + IMAGE_PADDING * 2, 800)
    const imageHeight = Math.max(bounds.height + IMAGE_PADDING * 2, 600)
    const [tx, ty, scale] = getTransformForBounds(bounds, imageWidth, imageHeight, 0.5, 2)

    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement
    if (!viewport) return

    // html-to-image는 getComputedStyle을 읽어 인라인 스타일로 복사한다.
    // 배경 패턴 SVG의 computed fill 기본값(black)만 none으로 설정.
    // (엣지/마커/레이블 SVG에는 적용하지 않아야 함)
    const bgEl = viewport.querySelector<SVGElement>('.react-flow__background')
    if (bgEl) bgEl.style.fill = 'none'

    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor: '#f8fafc',
        width: imageWidth,
        height: imageHeight,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        },
        filter: (node) => {
          const el = node as Element
          return (
            !el.classList?.contains('react-flow__minimap') &&
            !el.classList?.contains('react-flow__controls')
          )
        },
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${name || 'erd'}-diagram.png`
      a.click()
      toast.success('ERD 이미지 저장됨')
    } catch {
      toast.error('이미지 내보내기 실패')
    } finally {
      if (bgEl) bgEl.style.removeProperty('fill')
    }
  }, [getNodes, name])

  return (
    <Panel position="top-right">
      <div className="flex gap-1 items-center">
        <AutoLayoutButton />
        <button
          onClick={handleExport}
          className="bg-white border border-gray-300 text-gray-600 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-gray-50 hover:border-primary-400 hover:text-primary-600 shadow-sm transition-colors"
        >
          내보내기
        </button>
      </div>
    </Panel>
  )
}

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
  return relationships
    .filter((r) => r.sourceEntityId !== r.targetEntityId) // 자기 참조 관계 제외
    .map((r) => ({
      id: r.id,
      type: 'relationship',
      source: r.sourceEntityId,
      target: r.targetEntityId,
      label: REL_LABEL[r.type],
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280', width: 20, height: 20 },
      style: { strokeWidth: 2, stroke: '#6b7280' },
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
      // 자기 자신 연결 방지
      if (connection.source && connection.target && connection.source !== connection.target) {
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
        edgeTypes={edgeTypes}
        fitView
        deleteKeyCode="Delete"
        elevateNodesOnSelect
        edgesUpdatable={false}
      >
        <Background />
        <Controls />
        <MiniMap />
        <ExportButton />
      </ReactFlow>
    </div>
  )
}
