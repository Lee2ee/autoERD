package com.autoerd.service;

import com.autoerd.api.dto.AuthRequest;
import com.autoerd.api.dto.AuthResponse;
import com.autoerd.domain.user.User;
import com.autoerd.domain.user.UserRepository;
import com.autoerd.security.JwtProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;

    @Transactional
    public AuthResponse register(AuthRequest.Register req) {
        if (userRepository.existsByEmail(req.getEmail())) {
            throw new IllegalArgumentException("이미 사용 중인 이메일입니다: " + req.getEmail());
        }

        User user = new User();
        user.setEmail(req.getEmail());
        user.setUsername(req.getUsername());
        user.setPassword(passwordEncoder.encode(req.getPassword()));
        user.setRole(User.Role.USER);
        userRepository.save(user);

        String token = jwtProvider.generate(user.getId(), user.getEmail());
        return new AuthResponse(token, user.getId(), user.getEmail(), user.getUsername(), user.getRole().name());
    }

    public AuthResponse login(AuthRequest.Login req) {
        User user = userRepository.findByEmail(req.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        String token = jwtProvider.generate(user.getId(), user.getEmail());
        return new AuthResponse(token, user.getId(), user.getEmail(), user.getUsername(), user.getRole().name());
    }

    public AuthResponse me(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        String token = jwtProvider.generate(user.getId(), user.getEmail());
        return new AuthResponse(token, user.getId(), user.getEmail(), user.getUsername(), user.getRole().name());
    }
}
