# Crow Detector Server

The **Crow Detector Server** is a NestJS-based backend service that powers an interactive crow feeding system using Raspberry Pi devices. The system enables users to feed crows through a web interface or by visiting physical locations where Raspberry Pi devices are deployed.

The **Crow Detector Server** manages the core backend logic for the **Crow Detector Project** which includes the following components:

- **[Crow Detector Server](https://github.com/jessemull/crow-detector-server)**: The **Crow Detector** NestJS backend server.
- **[Crow Detector Client](https://github.com/jessemull/crow-detector-client)**: The **Crow Detector** NextJS client.
- **[Crow Detector Pi Devices](https://github.com/jessemull/crow-detector-pi)**: The **Crow Detector** Raspberry Pi device software.
- **[Crow Detector Lambda@Edge](https://github.com/jessemull/crow-detector-lambda-at-edge)**: The **Crow Detector** Lambda@Edge for deep-linking.

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Environments](#environments)
4. [Tech Stack](#tech-stack)
5. [Setup Instructions](#setup-instructions)
6. [Database Management](#database-management)
7. [Authentication](#authentication)
8. [Image Upload System](#image-upload-system)
9. [Lambda Function Integration](#lambda-function-integration)
10. [Automated Feeder System](#automated-feeder-system)
11. [Commits & Commitizen](#commits--commitizen)
   - [Making a Commit](#making-a-commit)
11. [Linting & Formatting](#linting--formatting)
    - [Linting Commands](#linting-commands)
    - [Formatting Commands](#formatting-commands)
    - [Pre-Commit Hook](#pre-commit-hook)
12. [Unit Tests & Code Coverage](#unit-tests--code-coverage)
    - [Unit Tests](#unit-tests)
    - [Code Coverage](#code-coverage)
13. [Development Workflow](#development-workflow)
    - [Running the Server](#running-the-server)
    - [SSH Tunnel Setup](#ssh-tunnel-setup)
14. [Deployment Pipelines](#deployment-pipelines)
    - [Deployment Strategy](#deployment-strategy)
    - [Tools Used](#tools-used)
    - [Pull Request](#pull-request)
    - [Deploy](#deploy)
    - [Deploy On Merge](#deploy-on-merge)
15. [Infrastructure](#infrastructure)
    - [CloudFormation Templates](#cloudformation-templates)
    - [Lambda Infrastructure](#lambda-infrastructure)
    - [ECS Task Definition](#ecs-task-definition)
    - [S3 Bucket Configuration](#s3-bucket-configuration)
16. [License](#license)

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
- **Motion Pi Device**: Raspberry Pi with PIR motion sensor and night vision camera:
  - Detects motion and captures images of feeding animals.
  - Uploads detection images to S3.

### Web Interface

- **Feed Button**: Users can feed crows directly from the website.
- **Image Gallery**: Displays user images alongside detection images.
- **Cooldown System**: Prevents spam feeding with configurable cooldown periods.

### Image Processing Pipeline

- **Content Moderation**: AWS Rekognition filters inappropriate content.
- **Face Detection**: AWS Rekognition detects faces and provides bounding box coordinates.
- **Image Cropping**: Sharp library crops images to focus on detected faces with padding.
- **Image Storage**: Organized S3 storage with separate directories for original and processed images.
- **Animal Detection**: AWS Rekognition identifies animals and provides confidence scores.
- **AI Classification**: Claude AI analyzes detected animals for species identification and crow detection.
- **Processing Workflow**: Comprehensive status tracking from upload to completion.

## System Architecture

The system employs a **microservices architecture** with the following key components:

### Backend Services

- **NestJS Server**: RESTful API endpoints for device communication and web interface.
- **PostgreSQL Database**: Stores feed events, detection events, and user interactions.
- **AWS S3**: Secure image storage with organized directory structure.
- **AWS Lambda**: S3 event processing and API integration (see [Lambda Documentation](lambda/README.md)).
- **AWS Rekognition**: AI-powered content moderation and face detection.
- **AWS SDK v3**: Modern, modular AWS SDK for improved performance.
- **Claude API**: AI analysis of detected animals for species identification and crow detection.
- **ECDSA Authentication**: Device-level security using cryptographic signatures.

### Data Flow

1. **Device Registration**: Raspberry Pi devices authenticate using ECDSA signatures.
2. **Image Upload**: Devices upload images via pre-signed S3 URLs.
3. **Lambda Processing**: S3 events trigger Lambda function to call Crow Detector API.
4. **Event Processing**: Server processes images and creates database records.
5. **Web Interface**: Users view results and interact with the system.
6. **Cooldown Management**: System enforces feeding limits and cooldown periods.

### Security Features

- **ECDSA Authentication**: Each device type has unique cryptographic keys.
- **Pre-signed URLs**: Secure S3 uploads without exposing AWS credentials.
- **Request Validation**: Timestamp-based replay attack prevention.
- **Environment Isolation**: Separate dev/prod environments with proper access controls.

## Environments

The **Crow Detector** operates in multiple environments to ensure smooth development, testing, and production workflows.

### Development Environment

- **Local Development**: `https://api-dev.crittercanteen.com`.
- **Database**: PostgreSQL via SSH tunnel to AWS RDS.
- **S3**: Development bucket with test images.
- **Authentication**: Development mode bypass available.

### Production Environment

- **API Endpoint**: `https://api.crittercanteen.com`.
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
- **AWS Rekognition**: AI-powered image analysis and animal detection.

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

- **Claude AI**: Anthropic's Claude for advanced animal species classification.
- **Fallback Processing**: Local detection algorithms when AI services are unavailable.
- **Confidence Scoring**: Multi-level confidence assessment for detection accuracy.

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
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=your_username
   DB_PASSWORD=your_password
   DB_DATABASE=crow_detector_dev

   # AWS Configuration
   AWS_REGION=us-west-2
   S3_BUCKET_NAME=crow-detector-images-dev

   # AI Configuration
   CLAUDE_API_KEY=your_claude_api_key
   CLAUDE_MODEL=claude-3-opus-20240229

   # Feed Configuration
   FEED_COOLDOWN_HOURS=4

   # Private Key Paths (for token generation)
   PI_USER_PRIVATE_KEY_PATH=/path/to/pi-user-private.pem
   PI_MOTION_PRIVATE_KEY_PATH=/path/to/pi-motion-private.pem
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
- **pi-motion**: Motion detection device (PIR sensor, night vision camera).
- **pi-feeder**: Automated feeder device (relay control, feed dispensing).

### Authentication Flow

1. **Device Identification**: Device sends `x-device-id` header.
2. **Timestamp Validation**: `x-timestamp` prevents replay attacks (5-minute window).
3. **Signature Verification**: `x-signature` validates request authenticity.
4. **Request Validation**: Signature covers method, path, body, and timestamp.

### Testing Authentication

Use the included authentication token generator:

```bash
# Generate token for feed URL endpoint
npm run auth:token POST /urls/feed '{"fileName":"test.jpg","format":"jpg","source":"motion","contentType":"image/jpeg"}'

# Generate token for detection URL endpoint
npm run auth:token POST /urls/detection '{"fileName":"detection.jpg","format":"jpg","feedEventId":"123","contentType":"image/jpeg"}' pi-motion
```

## Image Upload System

The system provides secure image upload capabilities through pre-signed S3 URLs:

### Upload Endpoints

- **`POST /urls/feed`**: Generate signed URL for user interaction images.
- **`POST /urls/detection`**: Generate signed URL for motion detection images.

### S3 Organization

- **Feed Images**: `feed/{timestamp}-{filename}.{format}` (triggers processing)
- **Detection Images**: `detection/{feedEventId}/{timestamp}-{filename}{format}` (triggers processing).
- **Processed Images**: `processed/{filename}_cropped.{format}` (safe from reprocessing).

### Image Processing Flow

1. **Upload**: Image uploaded to `feed/` or `detection/` directory.
2. **Processing**: Lambda function triggers image processing pipeline.
3. **Storage**: Processed images stored in separate `processed/` directory.
4. **Safety**: Processed images don't trigger reprocessing (prevents infinite loops).

#### Detection Event Processing Workflow

1. **Initial Status**: Detection events start with `PENDING` status.
2. **Processing Phase**: Status changes to `PROCESSING` during analysis.
3. **AI Analysis**: AWS Rekognition detects animals, Claude AI classifies species.
4. **Completion**: Status updates to `COMPLETED` with results or `FAILED` with errors.
5. **Metadata Storage**: Processing duration, error details, and analysis results saved.

### Image Metadata

- **Timestamp**: When the image was captured.
- **Source**: Device type and location information.
- **Feed Event ID**: Links detection images to feeding events.
- **Content Type**: Image format and encoding information.
- **Processing Status**: Current state of image processing pipeline.

## Lambda Function Integration

The **Crow Detector S3 Lambda** function automatically processes S3 image uploads and triggers the main server's image processing pipeline. For detailed information about the lambda function, see the [Lambda Documentation](lambda/README.md).

### How Lambda Works

1. **S3 Event Trigger**: When images are uploaded to `feed/` or `detection/` directories, S3 generates events
2. **SQS Queue**: Events are queued in SQS for reliable processing
3. **Lambda Execution**: Lambda function processes each event and calls the Crow Detector API
4. **API Integration**: Lambda authenticates using ECDSA signatures and triggers image processing
5. **Automatic Processing**: Server begins AI analysis pipeline without manual intervention

### Lambda Benefits

- **Automated Workflow**: Images are processed immediately upon upload
- **Reliable Processing**: SQS ensures events are not lost during high traffic
- **Scalable**: Handles multiple concurrent uploads efficiently
- **Secure**: Uses ECDSA authentication for API communication
- **Monitoring**: Comprehensive CloudWatch logging and metrics

## Detection Event Processing

The system provides comprehensive animal detection and analysis capabilities through a multi-stage processing pipeline:

### Processing Stages

- **PENDING**: Initial state when detection event is created.
- **PROCESSING**: Active analysis phase using AWS services.
- **COMPLETED**: Successful processing with results stored.
- **FAILED**: Processing error with detailed error information.

### Analysis Components

- **AWS Rekognition**: Primary animal detection with confidence scores.
- **Claude AI**: Advanced species classification and crow identification.
- **Fallback Detection**: Local processing when external services are unavailable.
- **Error Handling**: Comprehensive error tracking and retry mechanisms.

### Data Captured

- **Animal Counts**: Total animals and specific crow counts.
- **Species Detection**: Identified animal types and classifications.
- **Processing Metrics**: Duration, file sizes, and performance data.
- **Error Details**: Specific failure reasons for debugging.
- **Temporal Data**: Timestamps for processing and completion.

### Security Features

- **Pre-signed URLs**: Time-limited upload permissions.
- **Encryption**: Server-side encryption (AES256).
- **Access Control**: IAM-based permissions for S3 operations.
- **Lifecycle Management**: Automatic cleanup of old images.

## Automated Feeder System

The system provides comprehensive automation for physical crow feeding through Raspberry Pi devices with relay-controlled feeders:

### Feeder Status Flow

Feed events progress through the following automated status transitions:

1. **PENDING**: Initial state when a feed event is created (user clicks feed button or device triggers).
2. **FEEDING**: Feeder Pi activates relay and dispenses food.
3. **FEEDING_COMPLETE**: Feeding finished, waiting for verification photo.
4. **PHOTO_TAKEN**: Camera captures verification photo of the fed area.
5. **COMPLETE**: Full feeding cycle finished successfully.

### Device Coordination

#### Feeder Pi Device (pi-feeder):
- **Polling Interval**: Checks server every 30 seconds.
- **Status Monitoring**: `GET /feed/status/latest` looking for `PENDING` status.
- **Trigger Feeding**: `PATCH /feed/status/{id}` with `{"status": "FEEDING"}`.
- **Complete Feeding**: `PATCH /feed/status/{id}` with `{"status": "FEEDING_COMPLETE"}`.
- **Hardware Control**: Activates relay to dispense crow feed.

#### Camera Pi Device (pi-motion or dedicated camera):
- **Polling Interval**: Checks server every 30 seconds.
- **Status Monitoring**: `GET /feed/status/latest` looking for `FEEDING_COMPLETE` status.
- **Photo Capture**: Takes verification photo of feeding area.
- **Photo Upload**: Uploads image to S3 and updates status.
- **Status Update**: `PATCH /feed/status/{id}` with `{"status": "PHOTO_TAKEN", "photoUrl": "..."}`.

### Error Handling & Reliability

- **Network Resilience**: Devices continue polling even if network is temporarily unavailable.
- **Status Persistence**: All status changes are persisted in the database.
- **Retry Logic**: Failed operations can be retried by checking latest status.
- **Cooldown Override**: System supports `x-skip-cooldown: true` header for testing/manual overrides.

### Configuration

- **FEED_COOLDOWN_HOURS**: Configurable cooldown period between feeds (default: 4 hours).
- **Poll Intervals**: Adjustable polling frequency for different device types.
- **Authentication**: All status updates require ECDSA authentication for security.

## Commits & Commitizen

This project uses **Commitizen** to ensure commit messages follow a structured format and versioning is consistent. Commit linting is enforced via a pre-commit husky hook.

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

### Lambda Infrastructure

The lambda function infrastructure is managed separately in the `lambda/` directory:

- **`lambda/cloudformation/crow-detector-s3-lambda.yaml`**: Lambda function, IAM roles, and SQS integration
- **`lambda/cloudformation/crow-detector-lambda-s3.yaml`**: S3 event notification configuration
- **`lambda/cloudformation/crow-detector-sqs.yaml`**: SQS queue and event source mapping

For detailed lambda deployment and configuration, see the [Lambda Documentation](lambda/README.md).

### External AI Services

The system integrates with external AI services for advanced image analysis:

- **Anthropic Claude**: AI-powered animal species classification and crow detection.
- **API Integration**: Secure communication with Claude's API for image analysis.
- **Fallback Processing**: Local detection algorithms when AI services are unavailable.

### Required AWS Secrets

The following secrets must be configured in AWS Secrets Manager:

- **`crow-detector-keys`**: Contains device public keys for authentication
  - `pi-user-public-key`
  - `pi-motion-public-key` 
  - `pi-feeder-public-key`
  - `lambda-s3-public-key`
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
- **Event Notifications**: Smart triggers only on `feed/` and `detection/` directories.
- **Directory Structure**:
  - `feed/` - User interaction images (triggers processing)
  - `detection/` - Motion detection images (triggers processing)
  - `processed/` - Cropped/processed images (safe from reprocessing)

## License

    Apache License
    Version 2.0, January 2004
    http://www.apache.org/licenses/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

---

## About

The **Crow Detector** project combines IoT devices, image processing, and web technologies to create an interactive crow feeding system that promotes wildlife interaction while maintaining security and user experience standards.
