package com.autoerd.domain.relationship;

import com.autoerd.domain.project.Project;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "relationship_models")
@Getter @Setter
@NoArgsConstructor
public class RelationshipModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String clientId;

    @Column(nullable = false)
    private String sourceEntityClientId;

    @Column(nullable = false)
    private String targetEntityClientId;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private RelationType type;

    private String sourceLabel;
    private String targetLabel;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    public enum RelationType {
        ONE_TO_ONE, ONE_TO_MANY, MANY_TO_ONE, MANY_TO_MANY
    }
}
