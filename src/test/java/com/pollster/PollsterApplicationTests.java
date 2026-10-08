package com.pollster;

import com.pollster.dto.CastVoteRequest;
import com.pollster.dto.CreatePollRequest;
import com.pollster.dto.PollResponse;
import com.pollster.service.PollService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class PollsterApplicationTests {

    @Autowired
    private PollService pollService;

    @Test
    @DisplayName("Context loads successfully")
    void contextLoads() {
        assertNotNull(pollService);
    }

    @Test
    @DisplayName("Create poll and cast anonymous vote flow")
    void testCreatePollAndVoteFlow() {
        // 1. Create Poll
        CreatePollRequest request = new CreatePollRequest();
        request.setTitle("Which framework do you prefer?");
        request.setDescription("A quick anonymous poll for developers.");
        request.setOptions(List.of("Spring Boot", "FastAPI", "Express.js"));

        PollResponse created = pollService.createPoll(request);
        assertNotNull(created.getId());
        assertNotNull(created.getAdminKey());
        assertEquals(3, created.getOptions().size());
        assertEquals(0L, created.getTotalVotes());
        assertEquals(com.pollster.model.PollStatus.OPEN, created.getStatus());

        // 2. Cast Vote
        CastVoteRequest voteReq = new CastVoteRequest();
        voteReq.setOptionId(created.getOptions().get(0).getId());
        voteReq.setVoterToken("test-voter-token-1");

        PollResponse voted = pollService.castVote(created.getId(), voteReq, "192.168.1.100");
        assertEquals(1L, voted.getTotalVotes());
        assertTrue(voted.getHasVoted());

        // 3. Attempt Duplicate Vote (Should fail)
        assertThrows(IllegalStateException.class, () -> {
            pollService.castVote(created.getId(), voteReq, "192.168.1.100");
        });

        // 4. Close Poll with Admin Key
        PollResponse closed = pollService.closePoll(created.getId(), created.getAdminKey());
        assertEquals(com.pollster.model.PollStatus.CLOSED, closed.getStatus());

        // 5. Attempt Vote on Closed Poll (Should fail)
        CastVoteRequest voteReq2 = new CastVoteRequest();
        voteReq2.setOptionId(created.getOptions().get(1).getId());
        voteReq2.setVoterToken("test-voter-token-2");

        assertThrows(IllegalStateException.class, () -> {
            pollService.castVote(created.getId(), voteReq2, "192.168.1.101");
        });
    }

    @Test
    @DisplayName("Invalid admin key fails to close poll")
    void testInvalidAdminKey() {
        CreatePollRequest request = new CreatePollRequest();
        request.setTitle("Security test poll");
        request.setOptions(List.of("Option A", "Option B"));

        PollResponse created = pollService.createPoll(request);

        assertThrows(IllegalArgumentException.class, () -> {
            pollService.closePoll(created.getId(), "invalid-key-123");
        });
    }

    @Test
    @DisplayName("Duration options configuration and validation test")
    void testDurationConfigAndValidation() {
        var options = pollService.getDurationOptions();
        assertNotNull(options);
        assertFalse(options.isEmpty());

        // Valid duration (60 minutes)
        CreatePollRequest validReq = new CreatePollRequest();
        validReq.setTitle("Valid duration poll");
        validReq.setOptions(List.of("Yes", "No"));
        validReq.setDurationMinutes(60);

        PollResponse validPoll = pollService.createPoll(validReq);
        assertNotNull(validPoll.getId());

        // Invalid duration (9999 minutes - not in configured options)
        CreatePollRequest invalidReq = new CreatePollRequest();
        invalidReq.setTitle("Invalid duration poll");
        invalidReq.setOptions(List.of("Yes", "No"));
        invalidReq.setDurationMinutes(9999);

        assertThrows(IllegalArgumentException.class, () -> {
            pollService.createPoll(invalidReq);
        });
    }
}
