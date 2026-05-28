package com.autoerd.api;

import com.autoerd.api.dto.ApiKeyDto;
import com.autoerd.security.JwtProvider;
import com.autoerd.service.UserApiKeyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users/me")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class UserController {

    private final UserApiKeyService apiKeyService;
    private final JwtProvider jwtProvider;

    @GetMapping("/api-keys")
    public List<ApiKeyDto> listApiKeys(@RequestHeader("Authorization") String bearer) {
        return apiKeyService.listKeys(getUserId(bearer));
    }

    @PutMapping("/api-keys")
    public ResponseEntity<ApiKeyDto> saveApiKey(
            @RequestHeader("Authorization") String bearer,
            @RequestBody ApiKeyDto dto) {
        return ResponseEntity.ok(apiKeyService.saveKey(getUserId(bearer), dto));
    }

    @DeleteMapping("/api-keys/{provider}")
    public ResponseEntity<Void> deleteApiKey(
            @RequestHeader("Authorization") String bearer,
            @PathVariable String provider) {
        apiKeyService.deleteKey(getUserId(bearer), provider);
        return ResponseEntity.noContent().build();
    }

    private Long getUserId(String bearer) {
        return jwtProvider.getUserId(bearer.substring(7));
    }
}
