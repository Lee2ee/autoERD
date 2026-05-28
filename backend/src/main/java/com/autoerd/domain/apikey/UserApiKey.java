package com.autoerd.domain.apikey;

import com.autoerd.domain.user.User;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_api_keys",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "provider"}))
@Getter @Setter
@NoArgsConstructor
public class UserApiKey {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** AI provider 식별자 (예: "groq", "openai") */
    @Column(nullable = false)
    private String provider;

    /** AES-GCM 암호화된 API 키 (Base64) */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String encryptedKey;

    /** 사용자가 선택한 모델명 */
    private String model;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
