package com.pollster.controller;

import com.pollster.dto.CastVoteRequest;
import com.pollster.dto.CreatePollRequest;
import com.pollster.dto.DurationOption;
import com.pollster.dto.PollResponse;
import com.pollster.service.PollService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/polls")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class PollController {

    private final PollService pollService;

    @GetMapping("/config")
    public ResponseEntity<Map<String, Object>> getConfig() {
        return ResponseEntity.ok(Map.of("durations", pollService.getDurationOptions()));
    }

    @GetMapping("/durations")
    public ResponseEntity<List<DurationOption>> getDurations() {
        return ResponseEntity.ok(pollService.getDurationOptions());
    }

    @PostMapping
    public ResponseEntity<?> createPoll(@Valid @RequestBody CreatePollRequest request) {
        try {
            PollResponse response = pollService.createPoll(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage(), "message", e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<PollResponse> getPoll(
            @PathVariable UUID id,
            @RequestParam(required = false) String password,
            @RequestParam(required = false) String voterToken,
            @RequestParam(required = false) String adminKey,
            @RequestHeader(value = "X-Admin-Key", required = false) String headerAdminKey,
            HttpServletRequest httpRequest) {

        String effectiveAdminKey = resolveAdminKey(headerAdminKey, adminKey);
        String voterIp = extractClientIp(httpRequest);
        PollResponse poll = pollService.getPoll(id, password, voterIp, voterToken, effectiveAdminKey);
        return ResponseEntity.ok(poll);
    }

    @PostMapping("/{id}/vote")
    public ResponseEntity<?> castVote(
            @PathVariable UUID id,
            @Valid @RequestBody CastVoteRequest request,
            HttpServletRequest httpRequest) {

        try {
            String voterIp = extractClientIp(httpRequest);
            PollResponse response = pollService.castVote(id, request, voterIp);
            return ResponseEntity.ok(response);
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<?> closePoll(
            @PathVariable UUID id,
            @RequestParam(required = false) String adminKey,
            @RequestHeader(value = "X-Admin-Key", required = false) String headerAdminKey) {
        try {
            String effectiveAdminKey = resolveAdminKey(headerAdminKey, adminKey);
            PollResponse response = pollService.closePoll(id, effectiveAdminKey);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reopen")
    public ResponseEntity<?> reopenPoll(
            @PathVariable UUID id,
            @RequestParam(required = false) String adminKey,
            @RequestHeader(value = "X-Admin-Key", required = false) String headerAdminKey) {
        try {
            String effectiveAdminKey = resolveAdminKey(headerAdminKey, adminKey);
            PollResponse response = pollService.reopenPoll(id, effectiveAdminKey);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deletePoll(
            @PathVariable UUID id,
            @RequestParam(required = false) String adminKey,
            @RequestHeader(value = "X-Admin-Key", required = false) String headerAdminKey) {
        try {
            String effectiveAdminKey = resolveAdminKey(headerAdminKey, adminKey);
            pollService.deletePoll(id, effectiveAdminKey);
            return ResponseEntity.ok(Map.of("message", "Poll deleted successfully."));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        }
    }

    private String resolveAdminKey(String headerKey, String paramKey) {
        if (headerKey != null && !headerKey.isBlank()) {
            return headerKey;
        }
        return paramKey;
    }

    private String extractClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
