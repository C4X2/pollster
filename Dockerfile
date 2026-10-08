# Stage 1: Build Java 21 Application using Gradle Wrapper
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app

# Copy build configuration
COPY gradlew .
COPY gradle gradle
COPY build.gradle .
COPY settings.gradle .

# Grant execution rights on Gradle wrapper
RUN chmod +x ./gradlew

# Copy source code
COPY src src

# Build executable Boot JAR
RUN ./gradlew bootJar --no-daemon -x test

# Stage 2: Minimal Runtime Image
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

# Copy compiled JAR from builder stage
COPY --from=builder /app/build/libs/*.jar app.jar

# Set default server port
ENV PORT=8085
EXPOSE 8085

# Run Spring Boot application
ENTRYPOINT ["java", "-jar", "app.jar"]
