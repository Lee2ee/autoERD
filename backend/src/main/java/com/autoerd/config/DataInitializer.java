package com.autoerd.config;

import com.autoerd.domain.user.User;
import com.autoerd.domain.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        createIfAbsent("admin@autoerd.com",   "admin",   "admin123",    User.Role.ADMIN);
        createIfAbsent("alice@autoerd.com",   "Alice",   "password123", User.Role.USER);
        createIfAbsent("bob@autoerd.com",     "Bob",     "password123", User.Role.USER);
        log.info("=== 테스트 계정 ===");
        log.info("  admin@autoerd.com / admin123  (ADMIN)");
        log.info("  alice@autoerd.com / password123 (USER)");
        log.info("  bob@autoerd.com   / password123 (USER)");
    }

    private void createIfAbsent(String email, String username, String password, User.Role role) {
        if (!userRepository.existsByEmail(email)) {
            User u = new User();
            u.setEmail(email);
            u.setUsername(username);
            u.setPassword(passwordEncoder.encode(password));
            u.setRole(role);
            userRepository.save(u);
        }
    }
}
