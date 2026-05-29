package com.autoerd.service;

import com.autoerd.api.dto.*;
import com.autoerd.domain.attribute.AttributeModel;
import com.autoerd.domain.entity.EntityModel;
import com.autoerd.domain.project.*;
import com.autoerd.domain.relationship.RelationshipModel;
import com.autoerd.domain.user.User;
import com.autoerd.domain.user.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    /** 사용자가 멤버인 프로젝트 목록 */
    public List<ProjectDto> listProjects(Long userId) {
        return memberRepository.findProjectsByUserId(userId).stream()
                .map(p -> toDtoSummary(p, userId))
                .toList();
    }

    public ProjectDto getProject(Long id, Long userId) {
        Project project = findById(id);
        assertAccess(project.getId(), userId);
        return toDto(project, userId);
    }

    @Transactional
    public ProjectDto createProject(ProjectDto dto, Long userId) {
        User user = userRepository.getReferenceById(userId);
        Project project = new Project();
        project.setName(dto.getName());
        project.setDescription(dto.getDescription());
        project.setRequirement(dto.getRequirement());
        project.setBusinessRulesJson(toJson(dto.getBusinessRules()));
        applyEntities(project, dto);
        applyRelationships(project, dto);
        projectRepository.save(project);

        // 생성자를 OWNER로 등록
        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(user);
        member.setRole(ProjectMember.MemberRole.OWNER);
        memberRepository.save(member);

        return toDto(project, userId);
    }

    @Transactional
    public ProjectDto updateProject(Long id, ProjectDto dto, Long userId) {
        Project project = findById(id);
        assertEditorAccess(id, userId);

        if (dto.getName() != null) project.setName(dto.getName());
        if (dto.getDescription() != null) project.setDescription(dto.getDescription());
        if (dto.getRequirement() != null) project.setRequirement(dto.getRequirement());
        if (dto.getBusinessRules() != null) project.setBusinessRulesJson(toJson(dto.getBusinessRules()));
        if (dto.getEntities() != null) {
            project.getEntities().clear();
            applyEntities(project, dto);
        }
        if (dto.getRelationships() != null) {
            project.getRelationships().clear();
            applyRelationships(project, dto);
        }
        return toDto(project, userId);
    }

    @Transactional
    public void deleteProject(Long id, Long userId) {
        assertOwnerAccess(id, userId);
        projectRepository.deleteById(id);
    }

    // ─── 멤버 관리 ───────────────────────────────────────────────

    public List<MemberDto> getMembers(Long projectId, Long userId) {
        assertAccess(projectId, userId);
        return memberRepository.findByProjectId(projectId).stream()
                .map(m -> new MemberDto(
                        m.getUser().getId(),
                        m.getUser().getEmail(),
                        m.getUser().getUsername(),
                        m.getRole().name(),
                        m.getJoinedAt()))
                .toList();
    }

    @Transactional
    public MemberDto inviteMember(Long projectId, String email, String role, Long actorId) {
        assertOwnerAccess(projectId, actorId);

        User target = userRepository.findByEmail(email)
                .orElseThrow(() -> new NoSuchElementException("해당 이메일의 사용자를 찾을 수 없습니다: " + email));

        if (memberRepository.existsByProjectIdAndUserId(projectId, target.getId())) {
            throw new IllegalArgumentException("이미 프로젝트 멤버입니다.");
        }

        Project project = findById(projectId);
        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(target);
        member.setRole(ProjectMember.MemberRole.valueOf(role));
        memberRepository.save(member);

        return new MemberDto(target.getId(), target.getEmail(), target.getUsername(), role, member.getJoinedAt());
    }

    @Transactional
    public void removeMember(Long projectId, Long targetUserId, Long actorId) {
        // OWNER만 제거 가능, 단 자기 자신(OWNER)은 제거 불가
        assertOwnerAccess(projectId, actorId);
        if (targetUserId.equals(actorId)) {
            throw new IllegalArgumentException("프로젝트 소유자는 자신을 제거할 수 없습니다.");
        }
        memberRepository.deleteByProjectIdAndUserId(projectId, targetUserId);
    }

    @Transactional
    public MemberDto updateMemberRole(Long projectId, Long targetUserId, String role, Long actorId) {
        assertOwnerAccess(projectId, actorId);
        ProjectMember member = memberRepository.findByProjectIdAndUserId(projectId, targetUserId)
                .orElseThrow(() -> new NoSuchElementException("멤버를 찾을 수 없습니다."));
        member.setRole(ProjectMember.MemberRole.valueOf(role));
        return new MemberDto(
                member.getUser().getId(),
                member.getUser().getEmail(),
                member.getUser().getUsername(),
                role,
                member.getJoinedAt());
    }

    // ─── 접근 제어 ───────────────────────────────────────────────

    private void assertAccess(Long projectId, Long userId) {
        if (!memberRepository.existsByProjectIdAndUserId(projectId, userId)) {
            throw new SecurityException("프로젝트에 접근 권한이 없습니다.");
        }
    }

    private void assertEditorAccess(Long projectId, Long userId) {
        ProjectMember member = memberRepository.findByProjectIdAndUserId(projectId, userId)
                .orElseThrow(() -> new SecurityException("프로젝트에 접근 권한이 없습니다."));
        if (member.getRole() == ProjectMember.MemberRole.VIEWER) {
            throw new SecurityException("편집 권한이 없습니다.");
        }
    }

    private void assertOwnerAccess(Long projectId, Long userId) {
        ProjectMember member = memberRepository.findByProjectIdAndUserId(projectId, userId)
                .orElseThrow(() -> new SecurityException("프로젝트에 접근 권한이 없습니다."));
        if (member.getRole() != ProjectMember.MemberRole.OWNER) {
            throw new SecurityException("소유자 권한이 필요합니다.");
        }
    }

    // ─── 내부 헬퍼 ───────────────────────────────────────────────

    private Project findById(Long id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Project not found: " + id));
    }

    private void applyEntities(Project project, ProjectDto dto) {
        if (dto.getEntities() == null) return;
        for (EntityDto ed : dto.getEntities()) {
            EntityModel em = new EntityModel();
            em.setClientId(ed.getId());
            em.setName(ed.getName());
            em.setTableName(ed.getTableName());
            em.setDescription(ed.getDescription());
            em.setProject(project);
            if (ed.getPosition() != null) {
                em.setPositionX(ed.getPosition().getX());
                em.setPositionY(ed.getPosition().getY());
            }
            if (ed.getAttributes() != null) {
                for (AttributeDto ad : ed.getAttributes()) {
                    AttributeModel am = new AttributeModel();
                    am.setClientId(ad.getId());
                    am.setName(ad.getName());
                    am.setColumnName(ad.getColumnName());
                    am.setType(ad.getType());
                    am.setLength(ad.getLength());
                    am.setIsPrimary(ad.isPrimary());
                    am.setIsForeign(ad.isForeign());
                    am.setIsNullable(ad.isNullable());
                    am.setIsUnique(ad.isUnique());
                    am.setDefaultValue(ad.getDefaultValue());
                    am.setReferencedEntityClientId(ad.getReferencedEntityId());
                    am.setReferencedColumnClientId(ad.getReferencedColumnId());
                    am.setEntity(em);
                    em.getAttributes().add(am);
                }
            }
            project.getEntities().add(em);
        }
    }

    private void applyRelationships(Project project, ProjectDto dto) {
        if (dto.getRelationships() == null) return;
        for (RelationshipDto rd : dto.getRelationships()) {
            RelationshipModel rm = new RelationshipModel();
            rm.setClientId(rd.getId());
            rm.setSourceEntityClientId(rd.getSourceEntityId());
            rm.setTargetEntityClientId(rd.getTargetEntityId());
            rm.setType(RelationshipModel.RelationType.valueOf(rd.getType()));
            rm.setSourceLabel(rd.getSourceLabel());
            rm.setTargetLabel(rd.getTargetLabel());
            rm.setProject(project);
            project.getRelationships().add(rm);
        }
    }

    private ProjectDto toDtoSummary(Project p, Long userId) {
        ProjectDto dto = new ProjectDto();
        dto.setId(String.valueOf(p.getId()));
        dto.setName(p.getName());
        dto.setDescription(p.getDescription());
        dto.setCreatedAt(p.getCreatedAt());
        dto.setUpdatedAt(p.getUpdatedAt());
        memberRepository.findByProjectIdAndUserId(p.getId(), userId)
                .ifPresent(m -> dto.setMyRole(m.getRole().name()));
        dto.setMemberCount(memberRepository.findByProjectId(p.getId()).size());
        return dto;
    }

    private ProjectDto toDto(Project p, Long userId) {
        ProjectDto dto = toDtoSummary(p, userId);
        dto.setRequirement(p.getRequirement());
        dto.setBusinessRules(fromJson(p.getBusinessRulesJson()));
        dto.setEntities(p.getEntities().stream().map(this::toEntityDto).toList());
        dto.setRelationships(p.getRelationships().stream().map(this::toRelDto).toList());
        return dto;
    }

    private String toJson(List<Object> list) {
        if (list == null) return null;
        try {
            return objectMapper.writeValueAsString(list);
        } catch (Exception e) {
            log.error("businessRules JSON 직렬화 실패: {}", e.getMessage());
            return null;
        }
    }

    private List<Object> fromJson(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<Object>>() {});
        } catch (Exception e) {
            log.error("businessRules JSON 역직렬화 실패: {}", e.getMessage());
            return List.of();
        }
    }

    private EntityDto toEntityDto(EntityModel em) {
        EntityDto dto = new EntityDto();
        dto.setId(em.getClientId());
        dto.setName(em.getName());
        dto.setTableName(em.getTableName());
        dto.setDescription(em.getDescription());
        EntityDto.PositionDto pos = new EntityDto.PositionDto();
        pos.setX(em.getPositionX() != null ? em.getPositionX() : 0);
        pos.setY(em.getPositionY() != null ? em.getPositionY() : 0);
        dto.setPosition(pos);
        dto.setAttributes(em.getAttributes().stream().map(this::toAttrDto).toList());
        return dto;
    }

    private AttributeDto toAttrDto(AttributeModel am) {
        AttributeDto dto = new AttributeDto();
        dto.setId(am.getClientId());
        dto.setName(am.getName());
        dto.setColumnName(am.getColumnName());
        dto.setType(am.getType());
        dto.setLength(am.getLength());
        dto.setPrimary(Boolean.TRUE.equals(am.getIsPrimary()));
        dto.setForeign(Boolean.TRUE.equals(am.getIsForeign()));
        dto.setNullable(am.getIsNullable() == null || am.getIsNullable());
        dto.setUnique(Boolean.TRUE.equals(am.getIsUnique()));
        dto.setDefaultValue(am.getDefaultValue());
        dto.setReferencedEntityId(am.getReferencedEntityClientId());
        dto.setReferencedColumnId(am.getReferencedColumnClientId());
        return dto;
    }

    private RelationshipDto toRelDto(RelationshipModel rm) {
        RelationshipDto dto = new RelationshipDto();
        dto.setId(rm.getClientId());
        dto.setSourceEntityId(rm.getSourceEntityClientId());
        dto.setTargetEntityId(rm.getTargetEntityClientId());
        dto.setType(rm.getType().name());
        dto.setSourceLabel(rm.getSourceLabel());
        dto.setTargetLabel(rm.getTargetLabel());
        return dto;
    }
}
