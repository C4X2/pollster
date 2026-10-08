package com.pollster.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "poll_options")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PollOption {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "poll_id", nullable = false)
    @JsonIgnore
    private Poll poll;

    @Column(nullable = false)
    private String optionText;

    @Column(nullable = false)
    private Integer displayOrder;

    @Builder.Default
    @Column(nullable = false)
    private Long voteCount = 0L;
}
