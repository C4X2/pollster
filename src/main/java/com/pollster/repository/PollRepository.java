package com.pollster.repository;

import com.pollster.model.Poll;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PollRepository extends JpaRepository<Poll, UUID> {
    Optional<Poll> findByIdAndAdminKey(UUID id, String adminKey);
}
