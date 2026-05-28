package com.autoerd.service;

import com.autoerd.api.dto.AttributeDto;
import com.autoerd.api.dto.EntityDto;
import com.autoerd.api.dto.ProjectDto;
import com.autoerd.api.dto.RelationshipDto;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Rule-based deterministic DDL generator.
 * AI is NOT involved in SQL generation.
 */
@Service
public class DdlGeneratorService {

    public String generate(ProjectDto project) {
        List<String> lines = new ArrayList<>();
        lines.add("-- Auto-generated PostgreSQL DDL");
        lines.add("-- Project: " + project.getName());
        lines.add("-- Generated: " + LocalDateTime.now());
        lines.add("");

        for (EntityDto entity : project.getEntities()) {
            lines.add("CREATE TABLE IF NOT EXISTS " + entity.getTableName() + " (");

            List<String> cols = new ArrayList<>();
            for (AttributeDto attr : entity.getAttributes()) {
                StringBuilder col = new StringBuilder("  ");
                col.append(attr.getColumnName()).append(" ").append(mapType(attr));

                if (attr.isPrimary()) {
                    col.append(" GENERATED ALWAYS AS IDENTITY PRIMARY KEY");
                } else {
                    if (!attr.isNullable()) col.append(" NOT NULL");
                    if (attr.isUnique()) col.append(" UNIQUE");
                    if (attr.getDefaultValue() != null && !attr.getDefaultValue().isBlank()) {
                        col.append(" DEFAULT ").append(attr.getDefaultValue());
                    }
                }
                cols.add(col.toString());
            }

            lines.add(String.join(",\n", cols));
            lines.add(");");
            lines.add("");
        }

        // FK constraints
        List<String> fks = new ArrayList<>();
        for (EntityDto entity : project.getEntities()) {
            for (AttributeDto attr : entity.getAttributes()) {
                if (attr.isForeign() && attr.getReferencedEntityId() != null) {
                    EntityDto refEntity = project.getEntities().stream()
                            .filter(e -> e.getId().equals(attr.getReferencedEntityId()))
                            .findFirst().orElse(null);
                    if (refEntity != null) {
                        AttributeDto refPk = refEntity.getAttributes().stream()
                                .filter(AttributeDto::isPrimary)
                                .findFirst().orElse(null);
                        if (refPk != null) {
                            fks.add(String.format(
                                "ALTER TABLE %s ADD CONSTRAINT fk_%s_%s FOREIGN KEY (%s) REFERENCES %s(%s);",
                                entity.getTableName(),
                                entity.getTableName(), attr.getColumnName(),
                                attr.getColumnName(),
                                refEntity.getTableName(), refPk.getColumnName()
                            ));
                        }
                    }
                }
            }
        }

        // N:M 중간 테이블
        for (RelationshipDto rel : project.getRelationships()) {
            if ("MANY_TO_MANY".equals(rel.getType())) {
                EntityDto src = project.getEntities().stream()
                        .filter(e -> e.getId().equals(rel.getSourceEntityId()))
                        .findFirst().orElse(null);
                EntityDto tgt = project.getEntities().stream()
                        .filter(e -> e.getId().equals(rel.getTargetEntityId()))
                        .findFirst().orElse(null);
                if (src != null && tgt != null) {
                    String pivotTable = src.getTableName() + "_" + tgt.getTableName();
                    lines.add("CREATE TABLE IF NOT EXISTS " + pivotTable + " (");
                    lines.add("  " + src.getTableName() + "_id BIGINT NOT NULL,");
                    lines.add("  " + tgt.getTableName() + "_id BIGINT NOT NULL,");
                    lines.add("  PRIMARY KEY (" + src.getTableName() + "_id, " + tgt.getTableName() + "_id),");
                    lines.add("  FOREIGN KEY (" + src.getTableName() + "_id) REFERENCES " + src.getTableName() + "(id),");
                    lines.add("  FOREIGN KEY (" + tgt.getTableName() + "_id) REFERENCES " + tgt.getTableName() + "(id)");
                    lines.add(");");
                    lines.add("");
                }
            }
        }

        if (!fks.isEmpty()) {
            lines.add("-- Foreign Key Constraints");
            lines.addAll(fks);
        }

        return String.join("\n", lines);
    }

    private String mapType(AttributeDto attr) {
        String type = attr.getType().toUpperCase();
        return switch (type) {
            case "VARCHAR" -> "VARCHAR(" + (attr.getLength() != null ? attr.getLength() : 255) + ")";
            case "TEXT" -> "TEXT";
            case "INTEGER" -> "INTEGER";
            case "BIGINT" -> "BIGINT";
            case "DECIMAL" -> "DECIMAL(10, 2)";
            case "BOOLEAN" -> "BOOLEAN";
            case "TIMESTAMP" -> "TIMESTAMP";
            case "DATE" -> "DATE";
            case "UUID" -> "UUID";
            case "FLOAT" -> "FLOAT";
            case "JSON" -> "JSONB";
            default -> "VARCHAR(255)";
        };
    }
}
