package com.autoerd.api.dto;

import lombok.Data;

@Data
public class RelationshipDto {
    private String id;
    private String sourceEntityId;
    private String targetEntityId;
    private String type;
    private String sourceLabel;
    private String targetLabel;
}
