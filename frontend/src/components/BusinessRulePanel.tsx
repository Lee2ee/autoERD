import { useEntityStore } from '../stores/entityStore'
import { useRequirementStore } from '../stores/requirementStore'
import { BusinessRule, BusinessRuleType } from '../types'

const RULE_META: Record<BusinessRuleType, { label: string; color: string }> = {
  CHECK:   { label: 'CHECK',   color: 'bg-orange-100 text-orange-700' },
  UNIQUE:  { label: 'UNIQUE',  color: 'bg-blue-100 text-blue-700' },
  INDEX:   { label: 'INDEX',   color: 'bg-green-100 text-green-700' },
  CASCADE: { label: 'CASCADE', color: 'bg-red-100 text-red-700' },
  DEFAULT: { label: 'DEFAULT', color: 'bg-gray-100 text-gray-600' },
  ENUM:    { label: 'ENUM',    color: 'bg-purple-100 text-purple-700' },
  NULLABLE:{ label: 'NULLABLE',color: 'bg-yellow-100 text-yellow-700' },
  AUDIT:   { label: 'AUDIT',  color: 'bg-teal-100 text-teal-700' },
}

function BusinessRuleSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 bg-gray-200 rounded w-20" />
        <div className="h-3 bg-gray-100 rounded w-16" />
      </div>
      <div className="space-y-3">
        {[2, 3].map((rows, i) => (
          <div key={i}>
            <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
            <div className="space-y-1.5">
              {Array.from({ length: rows }).map((_, j) => (
                <div key={j} className="flex gap-2 p-2 rounded-md border border-gray-100 bg-gray-50">
                  <div className="w-4 h-4 bg-gray-200 rounded flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex gap-1.5">
                      <div className="h-4 bg-gray-200 rounded w-14" />
                      <div className="h-4 bg-gray-100 rounded w-20" />
                    </div>
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BusinessRulePanel() {
  const { businessRules, toggleBusinessRule, removeBusinessRule } = useEntityStore()
  const isAnalyzing = useRequirementStore((s) => s.isAnalyzing)

  if (isAnalyzing && businessRules.length === 0) return <BusinessRuleSkeleton />
  if (businessRules.length === 0) return null

  // 엔티티별 그룹핑
  const grouped = businessRules.reduce<Record<string, BusinessRule[]>>((acc, rule) => {
    if (!acc[rule.entity]) acc[rule.entity] = []
    acc[rule.entity].push(rule)
    return acc
  }, {})

  const enabledCount = businessRules.filter((r) => r.enabled).length

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">업무 규칙</h2>
        <span className="text-xs text-gray-400">
          {enabledCount}/{businessRules.length} 적용 중
        </span>
      </div>

      <div className="space-y-3">
        {Object.entries(grouped).map(([entity, rules]) => (
          <div key={entity}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {entity}
            </p>
            <div className="space-y-1">
              {rules.map((rule) => {
                const meta = RULE_META[rule.ruleType] ?? { label: rule.ruleType, color: 'bg-gray-100 text-gray-600' }
                return (
                  <div
                    key={rule.id}
                    className={`flex items-start gap-2 p-2 rounded-md border transition-opacity ${
                      rule.enabled
                        ? 'border-gray-200 bg-gray-50'
                        : 'border-gray-100 bg-white opacity-50'
                    }`}
                  >
                    {/* 토글 */}
                    <button
                      className="mt-0.5 flex-shrink-0 w-4 h-4 rounded border border-gray-300 flex items-center justify-center"
                      onClick={() => toggleBusinessRule(rule.id)}
                      title={rule.enabled ? '비활성화' : '활성화'}
                    >
                      {rule.enabled && (
                        <svg className="w-3 h-3 text-primary-600" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${meta.color}`}>
                          {meta.label}
                        </span>
                        {rule.column && (
                          <span className="text-xs text-gray-500 font-mono">{rule.column}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                        {rule.description}
                      </p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">
                        {rule.definition}
                      </p>
                    </div>

                    {/* 삭제 */}
                    <button
                      className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors text-xs leading-none mt-0.5"
                      onClick={() => removeBusinessRule(rule.id)}
                      title="규칙 삭제"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
