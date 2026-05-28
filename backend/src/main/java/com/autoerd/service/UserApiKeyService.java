package com.autoerd.service;

import com.autoerd.api.dto.ApiKeyDto;
import com.autoerd.domain.apikey.UserApiKey;
import com.autoerd.domain.apikey.UserApiKeyRepository;
import com.autoerd.domain.user.User;
import com.autoerd.domain.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserApiKeyService {

    private final UserApiKeyRepository apiKeyRepository;
    private final UserRepository userRepository;
    private final ApiKeyEncryptionService encryptionService;

    public List<ApiKeyDto> listKeys(Long userId) {
        return apiKeyRepository.findByUserId(userId).stream()
                .map(k -> new ApiKeyDto(k.getId(), k.getProvider(), k.getModel(), null)) // 복호화된 키는 반환 안 함
                .toList();
    }

    @Transactional
    public ApiKeyDto saveKey(Long userId, ApiKeyDto dto) {
        User user = userRepository.getReferenceById(userId);
        String encrypted = encryptionService.encrypt(dto.getApiKey());

        UserApiKey key = apiKeyRepository.findByUserIdAndProvider(userId, dto.getProvider())
                .orElseGet(() -> {
                    UserApiKey k = new UserApiKey();
                    k.setUser(user);
                    k.setProvider(dto.getProvider());
                    return k;
                });

        key.setEncryptedKey(encrypted);
        key.setModel(dto.getModel());
        apiKeyRepository.save(key);

        return new ApiKeyDto(key.getId(), key.getProvider(), key.getModel(), null);
    }

    @Transactional
    public void deleteKey(Long userId, String provider) {
        apiKeyRepository.deleteByUserIdAndProvider(userId, provider);
    }

    /** AI 서버 호출 시 내부적으로 복호화된 키 반환 */
    public String getDecryptedKey(Long userId, String provider) {
        return apiKeyRepository.findByUserIdAndProvider(userId, provider)
                .map(k -> encryptionService.decrypt(k.getEncryptedKey()))
                .orElse(null);
    }

    public String getPreferredModel(Long userId, String provider) {
        return apiKeyRepository.findByUserIdAndProvider(userId, provider)
                .map(UserApiKey::getModel)
                .orElse(null);
    }
}
