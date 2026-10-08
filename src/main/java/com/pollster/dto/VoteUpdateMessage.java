package com.pollster.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VoteUpdateMessage {
    private UUID pollId;
    private Long totalVotes;
    private List<PollOptionResponse> options;
}
