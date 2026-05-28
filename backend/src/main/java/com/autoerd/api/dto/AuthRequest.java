package com.autoerd.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

public class AuthRequest {

    @Data
    public static class Login {
        @Email @NotBlank
        private String email;
        @NotBlank
        private String password;
    }

    @Data
    public static class Register {
        @Email @NotBlank
        private String email;
        @NotBlank @Size(min = 2, max = 30)
        private String username;
        @NotBlank @Size(min = 6, max = 100)
        private String password;
    }
}
