package com.pollster.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PollResponse {
    private UUID id;
    private String title;
    private String description;
    private com.pollster.model.PollStatus status;
    private LocalDateTime expiresAt;
    private Boolean hasPassword;
    private Boolean captchaRequired;
    private String resultsVisibility;
    private LocalDateTime createdAt;
    private List<PollOptionResponse> options;
    private Long totalVotes;
    private Boolean hasVoted; // Populated based on voter IP/session
    private String adminKey; // Populated ONLY for admin/creator view
}
