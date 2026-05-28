package com.autoerd.domain.attribute;

import com.autoerd.domain.entity.EntityModel;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "attribute_models")
@Getter @Setter
@NoArgsConstructor
public class AttributeModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String clientId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String columnName;

    @Column(nullable = false)
    private String type;

    private Integer length;
    private Boolean isPrimary = false;
    private Boolean isForeign = false;
    private Boolean isNullable = true;
    private Boolean isUnique = false;
    private String defaultValue;
    private String referencedEntityClientId;
    private String referencedColumnClientId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id", nullable = false)
    private EntityModel entity;
}
