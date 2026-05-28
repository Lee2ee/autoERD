import { create } from 'zustand'
import { temporal } from 'zundo'
import { v4 as uuidv4 } from 'uuid'
import { Entity, Attribute, Relationship, DataType } from '../types'
import { toSnakeCase } from '../utils/naming'

interface EntityState {
  entities: Entity[]
  relationships: Relationship[]

  // Entity CRUD
  addEntity: (name: string, description?: string) => Entity
  updateEntity: (id: string, patch: Partial<Pick<Entity, 'name' | 'tableName' | 'description' | 'position'>>) => void
  removeEntity: (id: string) => void

  // Attribute CRUD
  addAttribute: (entityId: string, attr?: Partial<Attribute>) => void
  updateAttribute: (entityId: string, attrId: string, patch: Partial<Attribute>) => void
  removeAttribute: (entityId: string, attrId: string) => void

  // Relationship CRUD
  addRelationship: (rel: Omit<Relationship, 'id'>) => void
  updateRelationship: (id: string, patch: Partial<Omit<Relationship, 'id'>>) => void
  removeRelationship: (id: string) => void

  // Bulk
  setEntities: (entities: Entity[]) => void
  setRelationships: (relationships: Relationship[]) => void
  reset: () => void
}

const defaultAttribute = (override?: Partial<Attribute>): Attribute => ({
  id: uuidv4(),
  name: override?.name ?? '새 컬럼',
  columnName: override?.columnName ?? toSnakeCase(override?.name ?? 'new_column'),
  type: override?.type ?? 'VARCHAR',
  isPrimary: override?.isPrimary ?? false,
  isForeign: override?.isForeign ?? false,
  isNullable: override?.isNullable ?? true,
  isUnique: override?.isUnique ?? false,
  ...override,
})

export const useEntityStore = create<EntityState>()(
  temporal((set) => ({
    entities: [],
    relationships: [],

    addEntity: (name, description = '') => {
      const entity: Entity = {
        id: uuidv4(),
        name,
        tableName: toSnakeCase(name),
        description,
        attributes: [
          defaultAttribute({
            name: 'id',
            columnName: 'id',
            type: 'BIGINT' as DataType,
            isPrimary: true,
            isNullable: false,
          }),
        ],
        position: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 },
      }
      set((s) => ({ entities: [...s.entities, entity] }))
      return entity
    },

    updateEntity: (id, patch) => {
      set((s) => ({
        entities: s.entities.map((e) => {
          if (e.id !== id) return e
          const updated = { ...e, ...patch }
          // 이름 변경 시 tableName 자동 갱신 (사용자가 직접 변경하지 않은 경우)
          if (patch.name && !patch.tableName) {
            updated.tableName = toSnakeCase(patch.name)
          }
          return updated
        }),
      }))
    },

    removeEntity: (id) => {
      set((s) => ({
        entities: s.entities.filter((e) => e.id !== id),
        // 연결된 관계도 삭제
        relationships: s.relationships.filter(
          (r) => r.sourceEntityId !== id && r.targetEntityId !== id
        ),
      }))
    },

    addAttribute: (entityId, attr) => {
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId
            ? { ...e, attributes: [...e.attributes, defaultAttribute(attr)] }
            : e
        ),
      }))
    },

    updateAttribute: (entityId, attrId, patch) => {
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId
            ? {
                ...e,
                attributes: e.attributes.map((a) => {
                  if (a.id !== attrId) return a
                  const updated = { ...a, ...patch }
                  if (patch.name && !patch.columnName) {
                    updated.columnName = toSnakeCase(patch.name)
                  }
                  return updated
                }),
              }
            : e
        ),
      }))
    },

    removeAttribute: (entityId, attrId) => {
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId
            ? { ...e, attributes: e.attributes.filter((a) => a.id !== attrId) }
            : e
        ),
      }))
    },

    addRelationship: (rel) => {
      const newRel: Relationship = { ...rel, id: uuidv4() }
      set((s) => {
        // FK 컬럼 자동 추가
        const { entities } = s
        const sourceEntity = entities.find((e) => e.id === rel.sourceEntityId)
        const targetEntity = entities.find((e) => e.id === rel.targetEntityId)

        let updatedEntities = entities

        if (
          sourceEntity &&
          targetEntity &&
          (rel.type === 'MANY_TO_ONE' || rel.type === 'ONE_TO_ONE')
        ) {
          const fkAttr = defaultAttribute({
            name: `${targetEntity.name} ID`,
            columnName: `${targetEntity.tableName}_id`,
            type: 'BIGINT' as DataType,
            isForeign: true,
            isNullable: true,
            referencedEntityId: rel.targetEntityId,
          })
          updatedEntities = entities.map((e) =>
            e.id === rel.sourceEntityId
              ? { ...e, attributes: [...e.attributes, fkAttr] }
              : e
          )
        }

        if (sourceEntity && targetEntity && rel.type === 'ONE_TO_MANY') {
          const fkAttr = defaultAttribute({
            name: `${sourceEntity.name} ID`,
            columnName: `${sourceEntity.tableName}_id`,
            type: 'BIGINT' as DataType,
            isForeign: true,
            isNullable: true,
            referencedEntityId: rel.sourceEntityId,
          })
          updatedEntities = entities.map((e) =>
            e.id === rel.targetEntityId
              ? { ...e, attributes: [...e.attributes, fkAttr] }
              : e
          )
        }

        return {
          relationships: [...s.relationships, newRel],
          entities: updatedEntities,
        }
      })
    },

    updateRelationship: (id, patch) => {
      set((s) => ({
        relationships: s.relationships.map((r) =>
          r.id === id ? { ...r, ...patch } : r
        ),
      }))
    },

    removeRelationship: (id) => {
      set((s) => ({
        relationships: s.relationships.filter((r) => r.id !== id),
      }))
    },

    setEntities: (entities) => set({ entities }),
    setRelationships: (relationships) => set({ relationships }),
    reset: () => set({ entities: [], relationships: [] }),
  }))
)
