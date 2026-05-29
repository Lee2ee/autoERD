package com.autoerd.api;

import com.autoerd.security.JwtProvider;
import com.autoerd.service.UserApiKeyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiProxyController {

    @Value("${ai.server.url}")
    private String aiServerUrl;

    private final RestTemplate restTemplate;
    private final JwtProvider jwtProvider;
    private final UserApiKeyService apiKeyService;

    private Long extractUserId(String bearer) {
        if (bearer == null || !bearer.startsWith("Bearer ") || bearer.length() <= 7) {
            throw new IllegalArgumentException("Invalid Authorization header");
        }
        return jwtProvider.getUserId(bearer.substring(7));
    }

    @PostMapping("/normalize")
    public ResponseEntity<Object> normalize(
            @RequestBody Map<String, Object> body,
            @RequestHeader("Authorization") String bearer) {

        Long userId = extractUserId(bearer);

        HttpHeaders headers = new HttpHeaders();
        headers.set("Content-Type", "application/json");

        String apiKey = apiKeyService.getDecryptedKey(userId, "groq");
        if (apiKey != null) headers.set("X-Groq-Api-Key", apiKey);

        String model = apiKeyService.getPreferredModel(userId, "groq");
        if (model != null) headers.set("X-Groq-Model", model);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
        try {
            return ResponseEntity.ok(
                    restTemplate.postForObject(aiServerUrl + "/normalize", request, Object.class));
        } catch (HttpClientErrorException e) {
            return ResponseEntity.status(e.getStatusCode())
                    .<Object>body(Map.of("error", "AI 서버 오류: " + e.getStatusCode()));
        } catch (ResourceAccessException e) {
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                    .<Object>body(Map.of("error", "AI 서버 응답 시간 초과"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .<Object>body(Map.of("error", "정규화 중 오류가 발생했습니다: " + e.getMessage()));
        }
    }

    @PostMapping("/analyze")
    public ResponseEntity<Object> analyze(
            @RequestBody Map<String, String> body,
            @RequestHeader("Authorization") String bearer) {

        Long userId = extractUserId(bearer);

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
        try {
            return ResponseEntity.ok(
                    restTemplate.postForObject(aiServerUrl + "/analyze", request, Object.class));
        } catch (HttpClientErrorException e) {
            log.warn("AI server returned error {}: {}", e.getStatusCode(), e.getResponseBodyAsString());
            return ResponseEntity.status(e.getStatusCode())
                    .<Object>body(Map.of("error", "AI 서버 오류: " + e.getStatusCode()));
        } catch (ResourceAccessException e) {
            log.error("AI server unreachable or timeout: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                    .<Object>body(Map.of("error", "AI 서버 응답 시간 초과. 요구사항을 나눠서 입력해보세요."));
        } catch (Exception e) {
            log.error("Unexpected error calling AI server", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .<Object>body(Map.of("error", "분석 중 오류가 발생했습니다: " + e.getMessage()));
        }
    }
}
