package com.autoerd.api.dto;

import lombok.Data;
import java.util.List;

@Data
public class EntityDto {
    private String id;
    private String name;
    private String tableName;
    private String description;
    private List<AttributeDto> attributes;
    private PositionDto position;

    @Data
    public static class PositionDto {
        private double x;
        private double y;
    }
}
