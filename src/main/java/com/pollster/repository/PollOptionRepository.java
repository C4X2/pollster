package com.pollster.repository;

import com.pollster.model.PollOption;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.UUID;

public interface PollOptionRepository extends JpaRepository<PollOption, UUID> {
    @Modifying(clearAutomatically = true)
    @Query("UPDATE PollOption po SET po.voteCount = po.voteCount + 1 WHERE po.id = :optionId")
    void incrementVoteCount(UUID optionId);
}
