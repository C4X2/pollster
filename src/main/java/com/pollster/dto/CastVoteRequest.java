package com.pollster.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class CastVoteRequest {
    @NotNull(message = "Option ID is required")
    private UUID optionId;

    private String password;

    private String voterToken; // LocalStorage UUID token generated on client
}
