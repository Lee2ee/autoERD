package com.autoerd.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiKeyDto {
    private Long id;
    private String provider;  // "groq", "openai"
    private String model;
    private String apiKey;    // 저장/수신용. 응답 시 null (보안)
}
