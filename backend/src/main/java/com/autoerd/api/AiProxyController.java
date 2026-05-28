package com.autoerd.api;

import com.autoerd.security.JwtProvider;
import com.autoerd.service.UserApiKeyService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AiProxyController {

    @Value("${ai.server.url}")
    private String aiServerUrl;

    private final RestTemplate restTemplate;
    private final JwtProvider jwtProvider;
    private final UserApiKeyService apiKeyService;

    @PostMapping("/analyze")
    public ResponseEntity<Object> analyze(
            @RequestBody Map<String, String> body,
            @RequestHeader("Authorization") String bearer) {

        Long userId = jwtProvider.getUserId(bearer.substring(7));

        // 사용자 API 키를 AI 서버로 전달 (없으면 서버 기본값 사용)
        HttpHeaders headers = new HttpHeaders();
        headers.set("Content-Type", "application/json");

        String apiKey = apiKeyService.getDecryptedKey(userId, "groq");
        if (apiKey != null) {
            headers.set("X-Groq-Api-Key", apiKey);
        }

        String model = apiKeyService.getPreferredModel(userId, "groq");
        if (model != null) {
            headers.set("X-Groq-Model", model);
        }

        HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);
        return ResponseEntity.ok(
                restTemplate.postForObject(aiServerUrl + "/analyze", request, Object.class));
    }
}
