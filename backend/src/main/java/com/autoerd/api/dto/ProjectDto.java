package com.autoerd.api.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class ProjectDto {
    private String id;
    private String name;
    private String description;
    private String requirement;
    private List<Object> businessRules;
    private List<EntityDto> entities;
    private List<RelationshipDto> relationships;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String myRole;       // 요청 사용자의 역할
    private Integer memberCount;
}
