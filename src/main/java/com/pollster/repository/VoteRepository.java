package com.pollster.repository;

import com.pollster.model.Vote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface VoteRepository extends JpaRepository<Vote, UUID> {
    boolean existsByPollIdAndVoterHash(UUID pollId, String voterHash);
    long countByPollId(UUID pollId);
}
