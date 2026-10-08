package com.pollster.config;

import com.pollster.dto.DurationOption;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "pollster")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PollsterProperties {

    private List<DurationOption> durations = new ArrayList<>();
}
