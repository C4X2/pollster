package com.pollster.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class CreatePollRequest {

    @NotBlank(message = "Poll title is required")
    @Size(min = 3, max = 255, message = "Title must be between 3 and 255 characters")
    private String title;

    private String description;

    @NotEmpty(message = "At least two poll options are required")
    @Size(min = 2, max = 20, message = "Poll options must be between 2 and 20")
    private List<@NotBlank(message = "Option text cannot be blank") String> options;

    private String password;

    private Integer durationMinutes; // e.g. 60 for 1 hour, null for no expiry

    private Boolean captchaRequired = false;

    private String resultsVisibility = "PUBLIC"; // PUBLIC, HIDDEN_UNTIL_CLOSED, CREATOR_ONLY
}
