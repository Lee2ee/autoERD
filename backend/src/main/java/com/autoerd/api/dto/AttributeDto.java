package com.autoerd.api.dto;

import lombok.Data;

@Data
public class AttributeDto {
    private String id;
    private String name;
    private String columnName;
    private String type;
    private Integer length;
    private boolean isPrimary;
    private boolean isForeign;
    private boolean isNullable = true;
    private boolean isUnique;
    private String defaultValue;
    private String referencedEntityId;
    private String referencedColumnId;
}
