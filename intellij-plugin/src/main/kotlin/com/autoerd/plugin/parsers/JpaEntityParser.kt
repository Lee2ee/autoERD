package com.autoerd.plugin.parsers

import java.util.UUID

data class ParsedAttribute(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val columnName: String,
    val type: String,
    val length: Int? = null,
    val isPrimary: Boolean = false,
    val isForeign: Boolean = false,
    val isNullable: Boolean = true,
    val isUnique: Boolean = false,
)

data class ParsedEntity(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val tableName: String,
    val description: String,
    val attributes: MutableList<ParsedAttribute> = mutableListOf(),
    val position: Map<String, Int> = mapOf("x" to 0, "y" to 0),
)

data class ParsedRelationship(
    val id: String = UUID.randomUUID().toString(),
    val sourceEntityId: String,
    val targetEntityId: String,
    val type: String,
)

data class JpaParseResult(
    val entities: List<ParsedEntity>,
    val relationships: List<ParsedRelationship>,
    val warnings: List<String>,
)

/**
 * 텍스트 기반 JPA @Entity 파서.
 * PSI API 없이 regex로 동작하므로 com.intellij.java 의존성이 불필요합니다.
 */
object JpaEntityParser {

    // Java primitive/wrapper → SQL DataType 매핑
    private fun javaTypeToDataType(javaType: String): String {
        val t = javaType.substringBefore('<').trim().lowercase()
        return when (t) {
            "string"                     -> "VARCHAR"
            "long", "biginteger"         -> "BIGINT"
            "integer", "int"             -> "INTEGER"
            "double", "float"            -> "FLOAT"
            "bigdecimal"                 -> "DECIMAL"
            "boolean"                    -> "BOOLEAN"
            "localdatetime", "timestamp",
            "instant", "zoneddatetime"   -> "TIMESTAMP"
            "localdate", "date"          -> "DATE"
            "uuid"                       -> "UUID"
            "map", "jsonnode"            -> "JSON"
            else                         -> "VARCHAR"
        }
    }

    private fun toSnakeCase(str: String): String = str
        .replace(Regex("([A-Z])"), "_$1")
        .lowercase()
        .removePrefix("_")
        .replace(Regex("\\s+"), "_")
        .replace(Regex("[^a-z0-9_]"), "")

    /** 브레이스 쌍 추적으로 @Entity 클래스 블록 추출 */
    private fun extractClassBlocks(code: String): List<String> {
        val blocks = mutableListOf<String>()
        var i = 0
        while (i < code.length) {
            val entityIdx = code.indexOf("@Entity", i)
            if (entityIdx == -1) break
            val classIdx = code.indexOf("class ", entityIdx)
            if (classIdx == -1) break
            val openBrace = code.indexOf('{', classIdx)
            if (openBrace == -1) break
            var depth = 1
            var j = openBrace + 1
            while (j < code.length && depth > 0) {
                when (code[j]) {
                    '{' -> depth++
                    '}' -> depth--
                }
                j++
            }
            blocks.add(code.substring(entityIdx, j))
            i = j
        }
        return blocks
    }

    private data class RawField(val annotations: List<String>, val javaType: String, val fieldName: String)

    private fun extractFields(classBody: String): List<RawField> {
        val fields = mutableListOf<RawField>()
        val lines = classBody.lines()
        var pending = mutableListOf<String>()

        for (line in lines) {
            val t = line.trim()
            if (t.isEmpty()) { pending = mutableListOf(); continue }
            if (t.startsWith('@')) { pending.add(t); continue }

            val m = Regex(
                """^(?:(?:private|protected|public|static|final|transient)\s+)*""" +
                """([A-Z][\w<>,\s]*|(?:int|long|double|float|boolean|byte|char|short))\s+(\w+)\s*[;=]"""
            ).find(t)

            if (m != null) {
                fields.add(RawField(pending.toList(), m.groupValues[1].trim(), m.groupValues[2]))
                pending = mutableListOf()
            } else if (!t.startsWith("//") && !t.startsWith("*") && t != "{" && t != "}") {
                pending = mutableListOf()
            }
        }
        return fields
    }

    fun parse(code: String): JpaParseResult {
        val entities = mutableListOf<ParsedEntity>()
        val pendingRels = mutableListOf<Triple<String, String, String>>() // sourceId, targetName, type
        val warnings = mutableListOf<String>()

        val blocks = extractClassBlocks(code)
        if (blocks.isEmpty()) {
            warnings.add("@Entity 어노테이션을 찾을 수 없습니다.")
            return JpaParseResult(emptyList(), emptyList(), warnings)
        }

        for (block in blocks) {
            val classMatch = Regex("class\\s+(\\w+)").find(block) ?: continue
            val className = classMatch.groupValues[1]

            val tableMatch = Regex("""@Table\s*\([^)]*name\s*=\s*"([^"]+)"""").find(block)
            val tableName = tableMatch?.groupValues?.get(1) ?: (toSnakeCase(className) + "s")

            val entity = ParsedEntity(
                name = className,
                tableName = tableName,
                description = "$className 엔티티",
            )

            for (field in extractFields(block)) {
                if (field.fieldName == "serialVersionUID") continue
                val ann = field.annotations.joinToString("\n")
                val baseType = field.javaType.substringBefore('<').trim()
                val isCollection = field.javaType.matches(Regex("^(List|Set|Collection|Queue)<.*"))

                when {
                    ann.contains("@OneToMany") || (ann.contains("@ManyToMany") && isCollection) -> {
                        val typeArg = Regex("<(\\w+)>").find(field.javaType)?.groupValues?.get(1)
                        if (typeArg != null) {
                            val relType = if (ann.contains("@OneToMany")) "ONE_TO_MANY" else "MANY_TO_MANY"
                            pendingRels.add(Triple(entity.id, typeArg, relType))
                        }
                        continue
                    }
                    ann.contains("@ManyToOne") && !isCollection -> {
                        pendingRels.add(Triple(entity.id, baseType, "MANY_TO_ONE"))
                        continue
                    }
                    ann.contains("@OneToOne") && !isCollection -> {
                        pendingRels.add(Triple(entity.id, baseType, "ONE_TO_ONE"))
                        continue
                    }
                    isCollection -> continue
                }

                val isPrimary = ann.contains("@Id")
                val isUnique = ann.contains(Regex("unique\\s*=\\s*true"))
                val isNullable = !ann.contains(Regex("nullable\\s*=\\s*false")) && !isPrimary
                val colNameMatch = Regex("""name\s*=\s*"([^"]+)"""").find(ann)
                val columnName = colNameMatch?.groupValues?.get(1) ?: toSnakeCase(field.fieldName)
                val lengthMatch = Regex("""length\s*=\s*(\d+)""").find(ann)

                entity.attributes.add(
                    ParsedAttribute(
                        name = field.fieldName,
                        columnName = columnName,
                        type = javaTypeToDataType(field.javaType),
                        length = lengthMatch?.groupValues?.get(1)?.toIntOrNull(),
                        isPrimary = isPrimary,
                        isNullable = isNullable,
                        isUnique = isUnique,
                    )
                )
            }

            if (entity.attributes.isNotEmpty() && entity.attributes.none { it.isPrimary }) {
                val first = entity.attributes[0]
                entity.attributes[0] = first.copy(isPrimary = true)
                warnings.add("[${className}] @Id 필드가 없어 첫 번째 필드를 PK로 지정했습니다.")
            }

            entities.add(entity)
        }

        val nameToId = entities.associate { it.name to it.id }
        val relationships = mutableListOf<ParsedRelationship>()
        for ((sourceId, targetName, type) in pendingRels) {
            val targetId = nameToId[targetName]
            if (targetId != null) {
                relationships.add(ParsedRelationship(sourceEntityId = sourceId, targetEntityId = targetId, type = type))
            } else {
                warnings.add("관계 대상 '$targetName'을(를) 찾을 수 없습니다.")
            }
        }

        return JpaParseResult(entities, relationships, warnings)
    }
}
