package com.pollster.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "votes", indexes = {
    @Index(name = "idx_poll_voter", columnList = "pollId, voterHash")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Vote {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID pollId;

    @Column(nullable = false)
    private UUID optionId;

    @Column(nullable = false)
    private String voterHash;

    @Column(nullable = false, updatable = false)
    private LocalDateTime votedAt;

    @PrePersist
    protected void onCreate() {
        if (votedAt == null) {
            votedAt = LocalDateTime.now();
        }
    }
}
