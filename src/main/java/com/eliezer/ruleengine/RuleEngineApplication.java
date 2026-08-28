package com.eliezer.ruleengine;

import com.eliezer.ruleengine.rule.validation.RuleEngineProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(RuleEngineProperties.class)
public class RuleEngineApplication {

    static void main(String[] args) {
        SpringApplication.run(RuleEngineApplication.class, args);
    }
}
