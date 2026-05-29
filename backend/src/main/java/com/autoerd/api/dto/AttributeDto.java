package com.autoerd.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class AttributeDto {
    private String id;
    private String name;
    private String columnName;
    private String type;
    private Integer length;

    @JsonProperty("isPrimary")
    private boolean isPrimary;

    @JsonProperty("isForeign")
    private boolean isForeign;

    @JsonProperty("isNullable")
    private boolean isNullable = true;

    @JsonProperty("isUnique")
    private boolean isUnique;

    private String defaultValue;
    private String referencedEntityId;
    private String referencedColumnId;
}
