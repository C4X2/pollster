package com.pollster.service;

import com.pollster.config.PollsterProperties;
import com.pollster.dto.*;
import com.pollster.model.Poll;
import com.pollster.model.PollOption;
import com.pollster.model.PollStatus;
import com.pollster.model.Vote;
import com.pollster.repository.PollOptionRepository;
import com.pollster.repository.PollRepository;
import com.pollster.repository.VoteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PollService {

    private final PollRepository pollRepository;
    private final PollOptionRepository pollOptionRepository;
    private final VoteRepository voteRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final PollsterProperties pollsterProperties;

    private static final String SALT = "POLLSTER_SECRET_SALT_2026";

    public List<DurationOption> getDurationOptions() {
        return pollsterProperties.getDurations();
    }

    public boolean isValidDurationOption(Integer durationMinutes) {
        List<DurationOption> options = pollsterProperties.getDurations();
        if (options == null || options.isEmpty()) {
            return true;
        }
        for (DurationOption option : options) {
            Integer optMin = option.getMinutes();
            if (durationMinutes == null || durationMinutes == 0) {
                if (optMin == null || optMin == 0) {
                    return true;
                }
            } else if (durationMinutes.equals(optMin)) {
                return true;
            }
        }
        return false;
    }

    @Transactional
    public PollResponse createPoll(CreatePollRequest request) {
        if (!isValidDurationOption(request.getDurationMinutes())) {
            throw new IllegalArgumentException("Invalid duration option specified: " + request.getDurationMinutes());
        }

        String adminKey = generateSecureAdminKey();
        LocalDateTime expiresAt = request.getDurationMinutes() != null && request.getDurationMinutes() > 0
                ? LocalDateTime.now().plusMinutes(request.getDurationMinutes())
                : null;

        Poll poll = Poll.builder()
                .title(request.getTitle().trim())
                .description(request.getDescription() != null ? request.getDescription().trim() : null)
                .adminKey(adminKey)
                .password(request.getPassword() != null && !request.getPassword().isBlank() ? request.getPassword() : null)
                .expiresAt(expiresAt)
                .captchaRequired(Boolean.TRUE.equals(request.getCaptchaRequired()))
                .resultsVisibility(request.getResultsVisibility() != null ? request.getResultsVisibility() : "PUBLIC")
                .status(PollStatus.OPEN)
                .build();

        List<PollOption> options = new ArrayList<>();
        int order = 0;
        for (String optionText : request.getOptions()) {
            if (optionText != null && !optionText.isBlank()) {
                options.add(PollOption.builder()
                        .poll(poll)
                        .optionText(optionText.trim())
                        .displayOrder(order++)
                        .voteCount(0L)
                        .build());
            }
        }

        poll.setOptions(options);
        Poll savedPoll = pollRepository.save(poll);

        return mapToPollResponse(savedPoll, adminKey, null, false);
    }

    @Transactional(readOnly = true)
    public PollResponse getPoll(UUID pollId, String password, String voterIp, String voterToken, String adminKey) {
        Poll poll = pollRepository.findById(pollId)
                .orElseThrow(() -> new IllegalArgumentException("Poll not found with ID: " + pollId));

        boolean isAdmin = adminKey != null && adminKey.equals(poll.getAdminKey());

        if (poll.getPassword() != null && !isAdmin) {
            if (password == null || !password.equals(poll.getPassword())) {
                return PollResponse.builder()
                        .id(poll.getId())
                        .title(poll.getTitle())
                        .hasPassword(true)
                        .status(poll.getEffectiveStatus())
                        .build();
            }
        }

        String voterHash = computeVoterHash(pollId, voterIp, voterToken);
        boolean hasVoted = voteRepository.existsByPollIdAndVoterHash(pollId, voterHash);

        return mapToPollResponse(poll, isAdmin ? poll.getAdminKey() : null, voterHash, hasVoted);
    }

    @Transactional
    public PollResponse castVote(UUID pollId, CastVoteRequest request, String voterIp) {
        Poll poll = pollRepository.findById(pollId)
                .orElseThrow(() -> new IllegalArgumentException("Poll not found with ID: " + pollId));

        PollStatus effectiveStatus = poll.getEffectiveStatus();
        if (effectiveStatus == PollStatus.CLOSED) {
            throw new IllegalStateException("This poll has been closed by the creator.");
        }

        if (effectiveStatus == PollStatus.EXPIRED) {
            throw new IllegalStateException("This poll has expired.");
        }

        if (poll.getPassword() != null) {
            if (request.getPassword() == null || !request.getPassword().equals(poll.getPassword())) {
                throw new IllegalArgumentException("Invalid password for protected poll.");
            }
        }

        String voterHash = computeVoterHash(pollId, voterIp, request.getVoterToken());
        if (voteRepository.existsByPollIdAndVoterHash(pollId, voterHash)) {
            throw new IllegalStateException("You have already voted in this poll.");
        }

        PollOption selectedOption = pollOptionRepository.findById(request.getOptionId())
                .orElseThrow(() -> new IllegalArgumentException("Invalid option selected."));

        if (!selectedOption.getPoll().getId().equals(pollId)) {
            throw new IllegalArgumentException("Option does not belong to this poll.");
        }

        // Save Vote record
        Vote vote = Vote.builder()
                .pollId(pollId)
                .optionId(request.getOptionId())
                .voterHash(voterHash)
                .build();
        voteRepository.save(vote);

        // Increment Option count
        selectedOption.setVoteCount(selectedOption.getVoteCount() + 1);
        pollOptionRepository.save(selectedOption);

        // Refresh poll entity to get updated counts
        Poll updatedPoll = pollRepository.findById(pollId).orElse(poll);

        // Broadcast real-time WebSocket update
        broadcastVoteUpdate(updatedPoll);

        return mapToPollResponse(updatedPoll, null, voterHash, true);
    }

    @Transactional
    public PollResponse closePoll(UUID pollId, String adminKey) {
        Poll poll = pollRepository.findByIdAndAdminKey(pollId, adminKey)
                .orElseThrow(() -> new IllegalArgumentException("Invalid admin key or poll not found."));

        poll.setStatus(PollStatus.CLOSED);
        Poll saved = pollRepository.save(poll);
        broadcastVoteUpdate(saved);

        return mapToPollResponse(saved, adminKey, null, false);
    }

    @Transactional
    public PollResponse reopenPoll(UUID pollId, String adminKey) {
        Poll poll = pollRepository.findByIdAndAdminKey(pollId, adminKey)
                .orElseThrow(() -> new IllegalArgumentException("Invalid admin key or poll not found."));

        poll.setStatus(PollStatus.OPEN);
        Poll saved = pollRepository.save(poll);
        broadcastVoteUpdate(saved);

        return mapToPollResponse(saved, adminKey, null, false);
    }

    @Transactional
    public void deletePoll(UUID pollId, String adminKey) {
        Poll poll = pollRepository.findByIdAndAdminKey(pollId, adminKey)
                .orElseThrow(() -> new IllegalArgumentException("Invalid admin key or poll not found."));

        pollRepository.delete(poll);
    }

    private void broadcastVoteUpdate(Poll poll) {
        long totalVotes = poll.getOptions().stream()
                .mapToLong(PollOption::getVoteCount)
                .sum();

        List<PollOptionResponse> optionResponses = poll.getOptions().stream()
                .map(opt -> PollOptionResponse.builder()
                        .id(opt.getId())
                        .optionText(opt.getOptionText())
                        .displayOrder(opt.getDisplayOrder())
                        .voteCount(opt.getVoteCount())
                        .build())
                .collect(Collectors.toList());

        VoteUpdateMessage update = VoteUpdateMessage.builder()
                .pollId(poll.getId())
                .totalVotes(totalVotes)
                .options(optionResponses)
                .build();

        try {
            messagingTemplate.convertAndSend("/topic/polls/" + poll.getId(), update);
        } catch (Exception e) {
            log.error("Failed to broadcast WebSocket update for poll: {}", poll.getId(), e);
        }
    }

    private PollResponse mapToPollResponse(Poll poll, String adminKey, String voterHash, boolean hasVoted) {
        long totalVotes = poll.getOptions().stream()
                .mapToLong(opt -> opt.getVoteCount() != null ? opt.getVoteCount() : 0L)
                .sum();

        PollStatus effectiveStatus = poll.getEffectiveStatus();

        boolean showResults = "PUBLIC".equals(poll.getResultsVisibility())
                || (effectiveStatus == PollStatus.CLOSED && "HIDDEN_UNTIL_CLOSED".equals(poll.getResultsVisibility()))
                || adminKey != null;

        List<PollOptionResponse> optionResponses = poll.getOptions().stream()
                .map(opt -> PollOptionResponse.builder()
                        .id(opt.getId())
                        .optionText(opt.getOptionText())
                        .displayOrder(opt.getDisplayOrder())
                        .voteCount(showResults ? opt.getVoteCount() : 0L)
                        .build())
                .collect(Collectors.toList());

        return PollResponse.builder()
                .id(poll.getId())
                .title(poll.getTitle())
                .description(poll.getDescription())
                .status(effectiveStatus)
                .expiresAt(poll.getExpiresAt())
                .hasPassword(poll.getPassword() != null)
                .captchaRequired(poll.getCaptchaRequired())
                .resultsVisibility(poll.getResultsVisibility())
                .createdAt(poll.getCreatedAt())
                .options(optionResponses)
                .totalVotes(showResults ? totalVotes : 0L)
                .hasVoted(hasVoted)
                .adminKey(adminKey)
                .build();
    }

    private String generateSecureAdminKey() {
        SecureRandom random = new SecureRandom();
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String computeVoterHash(UUID pollId, String voterIp, String voterToken) {
        String raw = pollId.toString() + ":" + (voterIp != null ? voterIp : "unknown") + ":" + (voterToken != null ? voterToken : "anon") + ":" + SALT;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            return String.valueOf(raw.hashCode());
        }
    }
}
