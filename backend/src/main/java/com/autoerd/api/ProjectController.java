package com.autoerd.api;

import com.autoerd.api.dto.MemberDto;
import com.autoerd.api.dto.ProjectDto;
import com.autoerd.security.JwtProvider;
import com.autoerd.service.DdlGeneratorService;
import com.autoerd.service.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ProjectController {

    private final ProjectService projectService;
    private final DdlGeneratorService ddlGeneratorService;
    private final JwtProvider jwtProvider;

    @GetMapping
    public List<ProjectDto> list(@RequestHeader("Authorization") String bearer) {
        return projectService.listProjects(userId(bearer));
    }

    @GetMapping("/{id}")
    public ProjectDto get(@PathVariable Long id,
                          @RequestHeader("Authorization") String bearer) {
        return projectService.getProject(id, userId(bearer));
    }

    @PostMapping
    public ResponseEntity<ProjectDto> create(@RequestBody ProjectDto dto,
                                              @RequestHeader("Authorization") String bearer) {
        return ResponseEntity.ok(projectService.createProject(dto, userId(bearer)));
    }

    @PutMapping("/{id}")
    public ProjectDto update(@PathVariable Long id,
                              @RequestBody ProjectDto dto,
                              @RequestHeader("Authorization") String bearer) {
        return projectService.updateProject(id, dto, userId(bearer));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id,
                                        @RequestHeader("Authorization") String bearer) {
        projectService.deleteProject(id, userId(bearer));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/sql")
    public ResponseEntity<Map<String, Object>> generateSql(
            @PathVariable Long id,
            @RequestHeader("Authorization") String bearer) {
        ProjectDto project = projectService.getProject(id, userId(bearer));
        String sql = ddlGeneratorService.generate(project);
        return ResponseEntity.ok(Map.of("sql", sql, "projectId", id));
    }

    // ─── 멤버 관리 ─────────────────────────────────────────────

    @GetMapping("/{id}/members")
    public List<MemberDto> getMembers(@PathVariable Long id,
                                       @RequestHeader("Authorization") String bearer) {
        return projectService.getMembers(id, userId(bearer));
    }

    @PostMapping("/{id}/members")
    public ResponseEntity<MemberDto> invite(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            @RequestHeader("Authorization") String bearer) {
        String email = body.get("email");
        String role = body.getOrDefault("role", "EDITOR");
        return ResponseEntity.ok(projectService.inviteMember(id, email, role, userId(bearer)));
    }

    @PutMapping("/{id}/members/{userId}")
    public ResponseEntity<MemberDto> updateRole(
            @PathVariable Long id,
            @PathVariable Long userId,
            @RequestBody Map<String, String> body,
            @RequestHeader("Authorization") String bearer) {
        return ResponseEntity.ok(
                projectService.updateMemberRole(id, userId, body.get("role"), this.userId(bearer)));
    }

    @DeleteMapping("/{id}/members/{userId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable Long id,
            @PathVariable Long userId,
            @RequestHeader("Authorization") String bearer) {
        projectService.removeMember(id, userId, this.userId(bearer));
        return ResponseEntity.noContent().build();
    }

    private Long userId(String bearer) {
        if (bearer == null || !bearer.startsWith("Bearer ") || bearer.length() <= 7) {
            throw new IllegalArgumentException("Invalid Authorization header");
        }
        return jwtProvider.getUserId(bearer.substring(7));
    }
}
