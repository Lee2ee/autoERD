package com.autoerd.domain.entity;

import com.autoerd.domain.attribute.AttributeModel;
import com.autoerd.domain.project.Project;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "entity_models")
@Getter @Setter
@NoArgsConstructor
public class EntityModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String clientId; // 프론트엔드 uuid

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String tableName;

    @Column(columnDefinition = "TEXT")
    private String description;

    private Double positionX;
    private Double positionY;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @OneToMany(mappedBy = "entity", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<AttributeModel> attributes = new ArrayList<>();
}
