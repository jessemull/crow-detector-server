# Crow Detector Server

The **Crow Detector Server** is a NestJS-based backend service that powers an interactive crow feeding system using Raspberry Pi devices. The system enables users to feed crows through a web interface or by visiting physical locations where Raspberry Pi devices are deployed.

The **Crow Detector Server** manages the core backend logic for the **Crow Detector Project** which includes the following components:

- **[Crow Detector Server](https://github.com/jessemull/crow-detector-server)**: The **Crow Detector** NestJS backend server (this repository).
- **[Crow Detector Client](https://github.com/jessemull/crow-detector-client)**: The **Crow Detector** NextJS client (planned).
- **[Crow Detector Pi Devices](https://github.com/jessemull/crow-detector-pi)**: Raspberry Pi device software (planned).

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Environments](#environments)
4. [Tech Stack](#tech-stack)
5. [Setup Instructions](#setup-instructions)
6. [Database Management](#database-management)
7. [Authentication](#authentication)
8. [Image Upload System](#image-upload-system)
9. [Commits & Commitizen](#commits--commitizen)
   - [Making a Commit](#making-a-commit)
10. [Linting & Formatting](#linting--formatting)
    - [Linting Commands](#linting-commands)
    - [Formatting Commands](#formatting-commands)
    - [Pre-Commit Hook](#pre-commit-hook)
11. [Unit Tests & Code Coverage](#unit-tests--code-coverage)
    - [Unit Tests](#unit-tests)
    - [Code Coverage](#code-coverage)
12. [Development Workflow](#development-workflow)
    - [Running the Server](#running-the-server)
    - [SSH Tunnel Setup](#ssh-tunnel-setup)
13. [Deployment Pipelines](#deployment-pipelines)
    - [Deployment Strategy](#deployment-strategy)
    - [Tools Used](#tools-used)
    - [Pull Request](#pull-request)
    - [Deploy](#deploy)
    - [Deploy On Merge](#deploy-on-merge)
14. [Infrastructure](#infrastructure)
    - [CloudFormation Templates](#cloudformation-templates)
    - [ECS Task Definition](#ecs-task-definition)
    - [S3 Bucket Configuration](#s3-bucket-configuration)
15. [License](#license)

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
- **Content Moderation**: Filters inappropriate content.
- **Face Detection**: Crops and focuses on user faces.
- **Animal Detection**: Identifies animals in feeding images.
- **Image Storage**: Organized S3 storage with metadata.

## System Architecture

The system employs a **microservices architecture** with the following key components:

### Backend Services
- **NestJS Server**: RESTful API endpoints for device communication and web interface.
- **PostgreSQL Database**: Stores feed events, detection events, and user interactions.
- **AWS S3**: Secure image storage with organized directory structure.
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
- **Detection Events**: Animal detection images and metadata.
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
- **Feed Images**: `feed/{timestamp}-{filename}.{format}`
- **Detection Images**: `detection/{feedEventId}/{timestamp}-{filename}.{format}`

### Image Metadata
- **Timestamp**: When the image was captured.
- **Source**: Device type and location information.
- **Feed Event ID**: Links detection images to feeding events.
- **Content Type**: Image format and encoding information.

### Security Features
- **Pre-signed URLs**: Time-limited upload permissions.
- **Encryption**: Server-side encryption (AES256).
- **Access Control**: IAM-based permissions for S3 operations.
- **Lifecycle Management**: Automatic cleanup of old images.

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

### ECS Task Definition

The ECS task definition includes:
- **Container Configuration**: NestJS application with environment variables.
- **Resource Allocation**: CPU and memory specifications.
- **Environment Variables**: Database connection, S3 configuration, and device keys.
- **IAM Roles**: Permissions for S3, RDS, and other AWS services.

### S3 Bucket Configuration

The S3 bucket is configured with:
- **Versioning**: Maintains multiple versions of uploaded images.
- **Encryption**: Server-side encryption (AES256) for all objects.
- **Lifecycle Rules**: Automatic cleanup of old images and versions.
- **CORS Configuration**: Cross-origin resource sharing for web interface.
- **Bucket Policies**: Enforces encryption and access controls.

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
