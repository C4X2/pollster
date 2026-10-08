package com.pollster.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "polls")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Poll {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String title;

    @Column(length = 2000)
    private String description;

    @Column(nullable = false, unique = true)
    private String adminKey;

    private String password;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    @Column(nullable = false)
    private PollStatus status = PollStatus.OPEN;

    private LocalDateTime expiresAt;

    @Builder.Default
    @Column(nullable = false)
    private Boolean captchaRequired = false;

    @Builder.Default
    @Column(nullable = false)
    private String resultsVisibility = "PUBLIC"; // PUBLIC, HIDDEN_UNTIL_CLOSED, CREATOR_ONLY

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "poll", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("displayOrder ASC")
    @Builder.Default
    private List<PollOption> options = new ArrayList<>();

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public PollStatus getEffectiveStatus() {
        if (status == PollStatus.CLOSED) {
            return PollStatus.CLOSED;
        }
        if (expiresAt != null && LocalDateTime.now().isAfter(expiresAt)) {
            return PollStatus.EXPIRED;
        }
        return PollStatus.OPEN;
    }
}
