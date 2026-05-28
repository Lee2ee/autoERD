package com.autoerd.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class MemberDto {
    private Long userId;
    private String email;
    private String username;
    private String role;       // OWNER / EDITOR / VIEWER
    private LocalDateTime joinedAt;
}
