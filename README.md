# Crow Detector Server

The **Crow Detector Server** is a NestJS-based backend service that powers an interactive crow feeding system using Raspberry Pi devices. The system enables users to feed crows through a web interface or by visiting physical locations where Raspberry Pi devices are deployed.

The **Crow Detector Server** manages the core backend logic for the **Crow Detector Project** which includes the following components:

- **[Crow Detector Server](https://github.com/jessemull/crow-detector-server)**: The **Crow Detector** NestJS backend server (this repository).
- **[Crow Detector Client](https://github.com/jessemull/crow-detector-client)**: The **Crow Detector** NextJS client (planned).
- **[Crow Detector Pi Devices](https://github.com/jessemull/crow-detector-pi)**: Raspberry Pi device software (planned).

## Table of Contents

1. [AI Agents & Documentation](#ai-agents--documentation)
2. [Project Overview](#project-overview)
3. [System Architecture](#system-architecture)
4. [Environments](#environments)
5. [Tech Stack](#tech-stack)
6. [Setup Instructions](#setup-instructions)
7. [Database Management](#database-management)
8. [Authentication](#authentication)
9. [Image Upload System](#image-upload-system)
10. [Automated Feeder System](#automated-feeder-system)
11. [Commits & Commitizen](#commits--commitizen)
12. [Linting & Formatting](#linting--formatting)
13. [Unit Tests & Code Coverage](#unit-tests--code-coverage)
14. [Development Workflow](#development-workflow)
15. [Deployment Pipelines](#deployment-pipelines)
16. [Infrastructure](#infrastructure)
17. [License](#license)

## AI Agents & Documentation

AI agents and contributors **must** start with the governance chain:

| Doc                                                     | Purpose                                                  |
| ------------------------------------------------------- | -------------------------------------------------------- |
| [`CONTEXT.md`](./CONTEXT.md)                            | Primary entry — loading order, precedence, quality gates |
| [`AGENTS.md`](./AGENTS.md)                              | Full development rules for Nest + LAN recorders          |
| [`CLAUDE.md`](./CLAUDE.md) / [`GEMINI.md`](./GEMINI.md) | Thin redirects to CONTEXT/AGENTS                         |
| [`docs/GOVERNANCE.md`](./docs/GOVERNANCE.md)            | Authority, escalation, enforcement                       |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)        | Nest modules, feeder/porch flow, CloudFormation          |
| [`docs/TESTING.md`](./docs/TESTING.md)                  | Jest strategy and 80% coverage                           |
| [`docs/SECURITY.md`](./docs/SECURITY.md)                | ECDSA, secrets, IAM, logging                             |
| [`docs/ENVIRONMENT.md`](./docs/ENVIRONMENT.md)          | Environment variable reference                           |
| [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md)        | Branch / commit / PR workflow                            |
| [`docs/REVIEW.md`](./docs/REVIEW.md)                    | Review severity (MUST/SHOULD)                            |
| [`docs/COMMENTS.md`](./docs/COMMENTS.md)                | Comment policy                                           |

Quality gates: `make preflight` (also run by Husky on `git push`). Conventional Commits via Commitizen + commitlint.

## Project Overview

The **Crow Detector** is an interactive system that allows users to feed crows through multiple interfaces:

### Physical Device Interaction

- **User Pi Device**: Battery-powered Raspberry Pi with camera and LCD display:
  - Shows countdown timer before capturing user image.
  - Displays captcha for website access.
  - Captures and uploads user images to S3.
- **Feeder Pi Device**: Raspberry Pi connected to automated feeder with relay control:
  - Dispenses crow feed when triggered.
  - Monitors feeding activity.
- **Motion camera**: Sealed outdoor IP camera. A LAN host pulls RTSP and uploads detection images to S3.
- **Porch camera**: Sealed outdoor IP camera (for example a Tapo). A LAN host pulls RTSP, cuts the visit, and uploads mp4 clips to the private `porch/` prefix. See `docs/DEVICES.md`.

### Web Interface

- **Feed Button**: Users can feed crows directly from the website.
- **Image Gallery**: Displays user images alongside detection images.
- **Cooldown System**: Prevents spam feeding with configurable cooldown periods.

### Video and classify pipeline

- **Porch clips**: LAN host records RTSP visits and uploads mp4 objects under `porch/`.
- **Feeder proofs / visits**: LAN host records dispense proofs and motion visits under `feeder/`.
- **Animal classify**: Claude Haiku classifies sampled feeder frames via `POST /feeder/classify`.
- **Still-photo path removed**: No Rekognition / Sharp / S3→SQS Lambda pipeline.
- **Processing Workflow**: Comprehensive status tracking from upload to completion.

## System Architecture

The system employs a **microservices architecture** with the following key components:

### Backend Services

- **NestJS Server**: RESTful API endpoints for device communication and web interface.
- **PostgreSQL Database**: Stores feed events, detection events, and user interactions.
- **AWS S3**: Secure image storage with organized directory structure.
- **AWS Rekognition**: AI-powered content moderation and face detection.
- **AWS SDK v3**: Modern, modular AWS SDK for improved performance.
- **ECDSA Authentication**: Device-level security using cryptographic signatures.

### Data Flow

1. **Device Registration**: Raspberry Pi devices authenticate using ECDSA signatures.
2. **Image Upload**: Devices upload images via pre-signed S3 URLs.
3. **Event Processing**: Server processes images and creates database records.
4. **Web Interface**: Users view results and interact with the system.
5. **Cooldown Management**: System enforces feeding limits and cooldown periods.

### Security Features

- **ECDSA Authentication**: Each device type has unique cryptographic keys.
- **Pre-signed URLs**: Secure S3 uploads without exposing AWS credentials.
- **Request Validation**: Timestamp-based replay attack prevention.
- **Environment Isolation**: Separate dev/prod environments with proper access controls.

## Environments

The **Crow Detector** operates in multiple environments to ensure smooth development, testing, and production workflows.

### Development Environment

- **Local Development**: `https://api-dev.crittercanteen.com`
- **Database**: PostgreSQL via SSH tunnel to AWS RDS.
- **S3**: Development bucket with test images.
- **Authentication**: Development mode bypass available.

### Production Environment

- **API Endpoint**: `https://api.crittercanteen.com`
- **Database**: AWS RDS PostgreSQL instance.
- **S3**: Production bucket with organized image storage.
- **Authentication**: Full ECDSA signature verification.

## Tech Stack

The **Crow Detector Server** is built using modern technologies to ensure reliability, scalability, and maintainability.

### Backend Framework

- **NestJS**: Progressive Node.js framework for building efficient, scalable server-side applications.
- **TypeScript**: Provides type safety and enhanced developer experience.
- **TypeORM**: Object-Relational Mapping for database interactions.
- **PostgreSQL**: Robust, open-source relational database.

### AWS Infrastructure

- **AWS RDS**: Managed PostgreSQL database service.
- **AWS S3**: Object storage for image uploads and management.
- **AWS ECS**: Container orchestration for server deployment.
- **AWS CloudFormation**: Infrastructure as Code for resource management.
- **AWS IAM**: Identity and access management for secure resource access.
- **Anthropic Claude**: Feeder frame classify (Haiku) for animal visits when enabled.

### Development Tools

- **Jest**: JavaScript testing framework for unit and integration testing.
- **ESLint**: Code quality enforcement and static analysis.
- **Prettier**: Code formatting for consistent style.
- **Commitizen**: Standardized commit message format.
- **Husky**: Git hooks for pre-commit validation.

### Security & Authentication

- **ECDSA**: Elliptic Curve Digital Signature Algorithm for device authentication.
- **Crypto**: Node.js cryptographic functions for signature verification.
- **Environment Variables**: Secure configuration management.

### AI & Machine Learning

- **Claude AI**: Anthropic's Claude counts the living animals in a detection photo.
- **Confidence Scoring**: The model returns a confidence from 0 to 100 for each kind.

## Setup Instructions

To clone the repository, install dependencies, and run the project locally follow these steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/jessemull/crow-detector-server.git
   ```

2. **Navigate into the project directory:**

   ```bash
   cd crow-detector-server
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Set up environment variables:**
   Create a `.env` file in the root directory with the following variables:

   ```
   # Database Configuration
   RDS_HOST=localhost
   RDS_PORT=5432
   RDS_USERNAME=your_username
   RDS_PASSWORD=your_password
   RDS_DATABASE=crow_detector_dev

   # AWS Configuration
   AWS_REGION=us-west-2
   S3_BUCKET_NAME=crow-detector-images-dev

   # AI Configuration
   CLAUDE_API_KEY=your_claude_api_key
   CLAUDE_MODEL=claude-haiku-5-5

   # Feed Configuration

   # Private Key Paths (for token generation)
   PI_USER_PRIVATE_KEY_PATH=/path/to/pi-user-private.pem
   PI_FEEDER_PRIVATE_KEY_PATH=/path/to/pi-feeder-private.pem
   ```

5. **Set up SSH tunnel to database:**

   ```bash
   npm run start:tunnel
   ```

6. **Start the development server:**

   ```bash
   npm run start:watch
   ```

7. **Running the following command starts the tunnel and server concurrently:**
   ```
   npm run start:dev
   ```

## Database Management

The project includes database management scripts for development and testing:

### Database Scripts

- **Test Connection**: `npm run db:test` - Verify database connectivity.
- **Synchronize Schema**: `npm run db:synchronize` - Update database schema.
- **Seed Data**: `npm run db:seed` - Populate database with test data.
- **Reset Database**: `npm run db:reset` - Clear all data and reset schema.

### Database Schema

- **Feed Events**: Records of user interactions and feeding activities.
- **Detection Events**: Comprehensive animal detection data including:
  - Processing status (PENDING → PROCESSING → COMPLETED/FAILED).
  - Animal and crow counts with confidence scores.
  - Processing duration and error tracking.
  - AI analysis results and detected species.
  - Image metadata and processing history.
- **User Sessions**: User interaction tracking and cooldown management.

## Authentication

The system uses ECDSA (Elliptic Curve Digital Signature Algorithm) for device authentication:

### Device Types

- **pi-user**: User interaction device (camera, LCD, feed button).
- **pi-porch**: Porch camera device (motion clips under `porch/`).
- **pi-feeder**: Feeder host. Signs dispense proofs and animal-visit uploads. The relay is separate hardware and is not driven by the recorder.

### Authentication Flow

1. **Device Identification**: Device sends `x-device-id` header.
2. **Timestamp Validation**: `x-timestamp` prevents replay attacks (5-minute window).
3. **Signature Verification**: `x-signature` validates request authenticity.
4. **Request Validation**: Signature covers method, path, body, and timestamp.

### Testing Authentication

Use the included authentication token generator:

```bash
# Generate token for feed URL endpoint
npm run auth:token POST /urls/porch '{"fileName":"clip-1","contentLength":1200}' pi-porch

# Generate token for detection URL endpoint
npm run auth:token POST /urls/feeder '{"fileName":"proof-1","contentLength":4096,"contentType":"video/mp4"}' pi-feeder
```

## Image Upload System

The system provides secure image upload capabilities through pre-signed S3 URLs:

### Upload Endpoints

- **`POST /urls/porch`**: Generate signed URL for porch-camera mp4 uploads.
- **`POST /urls/feeder`**: Generate a size-capped signed URL for feeder mp4 uploads (`pi-feeder`).
- **`GET /porch/clips`**: Public list of porch clips with short-lived playback URLs.
- **`POST /feeder/dispense`**, **`GET /feeder/dispense/{id}`**, **`GET /feeder/clips`**: Public dispense and visit playback.
- **`GET /feeder/dispense/pending`**, **`PATCH /feeder/dispense/{id}`**, **`POST /feeder/classify`**, **`POST /feeder/visits`**: Feeder host routes.

### S3 Organization

- **Porch clips**: `porch/{timestamp}-{name}.mp4` (30-day lifecycle prefix rule)
- **Feeder clips**: `feeder/{timestamp}-{name}.mp4` (30-day lifecycle prefix rule)

### Clip flow

1. **Upload**: ECDSA device requests a presigned PUT (`/urls/porch` or `/urls/feeder`), then PUTs the mp4.
2. **Classify (feeder visits)**: Optional Claude frame classify when `FEEDER_REQUIRE_ANIMAL=true` on the host.
3. **List / playback**: Public list routes return short-lived signed GET URLs.

### Security Features

- **Pre-signed URLs**: Time-limited upload and playback permissions.
- **Encryption**: Server-side encryption (AES256) on uploads.
- **Access Control**: IAM-based permissions for S3 operations; device ECDSA on host routes.
- **Lifecycle Management**: Automatic cleanup of old porch/ and feeder/ objects.

## Feeder recorder

The feeder host records a fixed 12-second proof from the public dispense request, and records motion visits separately. The relay is not part of this recorder. Public dispense cooldown is 10 minutes (fail closed). `POST /feeder/dispense` is a public unauthenticated write (rate-limited) and stays under human review for prod exposure.

- **Proof**: `POST /feeder/dispense` creates a request. The host claims `GET /feeder/dispense/pending`, uploads an mp4, then `PATCH /feeder/dispense/{id}` to `ready` or `failed`.
- **Visits**: Default host config publishes each motion visit (`FEEDER_REQUIRE_ANIMAL=false`). Set `FEEDER_REQUIRE_ANIMAL=true` to classify via `POST /feeder/classify` and drop empty frames before `POST /feeder/visits`.
- **Playback**: `GET /feeder/dispense/{id}` and `GET /feeder/clips` return short-lived playback URLs while the object is still inside the 30-day feeder lifecycle.

## Commits & Commitizen

This project uses **Commitizen** to ensure commit messages follow a structured format and versioning is consistent. Commit linting runs in the `commit-msg` Husky hook. The pre-commit hook runs lint-staged.

### Making a Commit

To make a commit in the correct format, run the following command. Commitizen will walk you through the creation of a structured commit message and versioning:

```bash
npm run commit
```

## Linting & Formatting

This project uses **ESLint** and **Prettier** for code quality enforcement. Linting is enforced during every CI/CD pipeline to ensure consistent standards.

### Linting Commands

Run linting:

```bash
npm run lint
```

### Formatting Commands

Format using prettier:

```bash
npm run format
```

### Pre-Commit Hook

**Lint-staged** is configured to run linting before each commit. The commit will be blocked if linting fails, ensuring code quality at the commit level.

## Unit Tests & Code Coverage

### Unit Tests

This project uses **Jest** for testing. Code coverage is enforced during every CI/CD pipeline. The build will fail if any tests fail or coverage drops below **80%**.

Run tests:

```bash
npm run test
```

Run tests with coverage:

```bash
npm run test:cov
```

Run tests in watch mode:

```bash
npm run test:watch
```

### Code Coverage

Coverage thresholds are enforced at **80%** for all metrics. The build will fail if coverage drops below this threshold.

## Development Workflow

### Running the Server

The development server can be started in several modes:

```bash
# Start with SSH tunnel and watch mode
npm run start:dev

# Start only the SSH tunnel
npm run start:tunnel

# Start only the server in watch mode
npm run start:watch

# Start in debug mode
npm run start:debug
```

### SSH Tunnel Setup

The development environment uses an SSH tunnel to connect to the AWS RDS database:

```bash
npm run start:tunnel
```

This creates a secure tunnel through the bastion host to access the private RDS instance.

## Deployment Pipelines

This project uses automated deployment pipelines to ensure a smooth and reliable deployment process utilizing AWS CloudFormation, GitHub Actions, and ECS.

### Deployment Strategy

The deployment process ensures reliability and consistency through:

- **Containerized Deployment**: Docker containers deployed to AWS ECS Fargate.
- **Infrastructure as Code**: CloudFormation templates for all AWS resources.
- **Automated Testing**: GitHub Actions workflows for CI/CD.
- **Environment Isolation**: Separate dev/prod configurations.
- **Rollback Capability**: Quick restoration of previous versions.

### Tools Used

- **AWS CLI**: Configures the AWS environment for deployments.
- **GitHub Actions**: Automates and schedules the deployment pipelines.
- **CloudFormation**: Orchestrates infrastructure changes and deployments.
- **ECS**: Container orchestration for server deployment.
- **Docker**: Containerization for consistent deployment.

### Pull Request

This pipeline automates the validation process for pull requests targeting the `main` branch. It ensures that new changes are properly built, linted, tested, and evaluated before merging.

The pipeline performs the following steps:

1. **Build Application** – Checks out the code, installs dependencies, and builds the NestJS application.
2. **Lint Code** – Runs ESLint to check for syntax and style issues.
3. **Run Unit Tests** – Executes Jest tests and ensures test coverage meets the required threshold.

### Deploy

This pipeline automates the deployment of the NestJS application to AWS ECS. It supports deployment to either the dev or production environment based on user input.

The pipeline performs the following steps:

1. **Build Application** – Builds the NestJS application and creates a Docker container.
2. **Run Unit Tests** – Executes Jest tests and ensures test coverage.
3. **Deploy to ECS** – Updates the ECS task definition and deploys the new container.

### Deploy On Merge

This workflow runs automatically when changes are pushed to the `main` branch. It builds, tests, and deploys the NestJS application to ECS.

## Infrastructure

### CloudFormation Templates

Infrastructure is managed using AWS CloudFormation templates with environment-specific parameterization:

- **`crow-detector-alb.yaml`**: Application Load Balancer configuration.
- **`crow-detector-ecs-cluster.yaml`**: ECS cluster and related resources.
- **`crow-detector-ecs-task.yaml`**: ECS task definition and service configuration.
- **`crow-detector-iam-roles.yaml`**: IAM roles and policies for ECS tasks.
- **`crow-detector-rds.yaml`**: RDS PostgreSQL database configuration.
- **`crow-detector-s3.yaml`**: S3 bucket configuration for image storage.

### External AI Services

The system integrates with external AI services for advanced image analysis:

- **Anthropic Claude**: AI-powered animal species classification and crow detection.
- **API Integration**: Secure communication with Claude's API for image analysis.
- **Fallback Processing**: Local detection algorithms when AI services are unavailable.

### Required AWS Secrets

The following secrets must be configured in AWS Secrets Manager:

- **`crow-detector-keys`**: Contains device public keys for authentication
  - `pi-user-public-key`
  - `pi-feeder-public-key`
- **`crow-detector-db-{environment}`**: Database credentials
  - `username`
  - `password`
- **`crow-detector-claude-api-key`**: Claude AI API key
  - `claude-api-key`

### ECS Task Definition

The ECS task definition includes:

- **Container Configuration**: NestJS application with environment variables.
- **Resource Allocation**: CPU and memory specifications.
- **Environment Variables**: Database connection, S3 configuration, device keys, and Claude API configuration.
- **IAM Roles**: Permissions for S3, RDS, and other AWS services.
- **AI Service Configuration**: Claude API key (from AWS Secrets Manager) and endpoint configuration for animal detection.

### S3 Bucket Configuration

The S3 bucket is configured with:

- **Versioning**: Maintains multiple versions of uploaded images.
- **Encryption**: Server-side encryption (AES256) for all objects.
- **Lifecycle Rules**: Automatic cleanup of old images and versions.
- **CORS Configuration**: Cross-origin resource sharing for web interface.
- **Bucket Policies**: Enforces encryption and access controls.
- **Event Notifications**: Removed with the still-photo pipeline. Porch and feeder videos do not enqueue SQS.
- **Directory Structure**:
  - `detection/` - Motion detection images (triggers processing)
  - `porch/` - Porch camera clips (no notification; deleted after about 30 days via the S3 stack lifecycle rule — deploy `crow-detector-s3.yaml` when that rule changes; merge.yml does not update the S3 stack)
  - `feeder/` - Feeder proof and visit clips (no notification; same 30-day lifecycle rule; review the rule and the public dispense route before production)
  - `processed/` - Cropped/processed images (safe from reprocessing)

## License

This package is `UNLICENSED`. See `package.json`.

---

## About

The **Crow Detector** project combines IoT devices, image processing, and web technologies to create an interactive crow feeding system that promotes wildlife interaction while maintaining security and user experience standards.
