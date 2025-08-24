# Crow Detector S3 Lambda

The **Crow Detector S3 Lambda** is an AWS Lambda function that processes S3 events and triggers the Crow Detector API to handle image processing. This lambda function serves as the bridge between S3 image uploads and the main server's image processing pipeline.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [How It Works](#how-it-works)
4. [Setup & Development](#setup--development)
5. [Testing](#testing)
6. [Linting & Code Quality](#linting--code-quality)
7. [Building & Packaging](#building--packaging)
8. [Deployment](#deployment)
9. [Configuration](#configuration)
10. [Monitoring & Logging](#monitoring--logging)

## Overview

The lambda function is triggered by S3 events via SQS (Simple Queue Service) and processes image uploads to trigger the Crow Detector API. It handles:

- **S3 Event Processing**: Listens for image uploads to the `feed/` and `detection/` directories
- **API Integration**: Calls the Crow Detector server to trigger image processing
- **Authentication**: Uses ECDSA signatures to authenticate with the API
- **Error Handling**: Comprehensive error handling and logging for debugging

## Architecture

```
S3 Upload → S3 Event → SQS Queue → Lambda Function → Crow Detector API
```

### Components

- **S3 Bucket**: Stores uploaded images in organized directories
- **SQS Queue**: Buffers S3 events for reliable processing
- **Lambda Function**: Processes events and calls the API
- **Crow Detector API**: Main server that handles image processing

### Event Flow

1. **Image Upload**: User or device uploads image to S3
2. **S3 Event**: S3 generates event notification
3. **SQS Queue**: Event is queued for processing
4. **Lambda Trigger**: Lambda processes SQS message
5. **API Call**: Lambda calls Crow Detector API with image details
6. **Image Processing**: Server processes image through AI pipeline

## How It Works

### Event Processing

The lambda function processes SQS records containing S3 event information:

```typescript
export const handler = async (
  event: SQSEvent,
  context: Context,
  callback: Callback,
): Promise<void> => {
  // Process each SQS record
  for (const record of event.Records) {
    const result = await processSQSRecord(record);
    results.push(result);
  }
  // Return success/failure based on results
}
```

### Image Filtering

The function filters events to only process relevant image uploads:

- **File Type**: Only processes image files (jpg, jpeg, png, gif)
- **Event Type**: Only processes upload events (ObjectCreated:*)
- **Directory**: Only processes uploads to `feed/` or `detection/` directories

### API Integration

For each relevant image, the lambda calls the Crow Detector API:

- **Feed Images**: Calls `/feed` endpoint to create feed events
- **Detection Images**: Calls `/detection` endpoint to create detection events
- **Authentication**: Uses ECDSA signatures for secure API communication

## Setup & Development

### Prerequisites

- Node.js 20.x or later
- AWS CLI configured with appropriate permissions
- Access to Crow Detector S3 bucket and SQS queue

### Installation

1. **Navigate to lambda directory:**
   ```bash
   cd lambda
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file with:
   ```
   API_BASE_URL=https://api-dev.crittercanteen.com
   DETECTION_ENDPOINT=/detection
   FEED_ENDPOINT=/feed
   NODE_ENV=development
   LAMBDA_S3_PRIVATE_KEY=your_private_key_here
   ```

### Development Commands

```bash
# Build the lambda function
npm run build

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Clean build artifacts
npm run clean
```

## Testing

The project uses **Jest** for comprehensive testing with high coverage requirements.

### Test Structure

- **Unit Tests**: Test individual functions and utilities
- **Integration Tests**: Test API calls and S3 event processing
- **Mock Testing**: Uses mocks for AWS services and external APIs

### Running Tests

```bash
# Run all tests
npm run test

# Run tests with coverage (80% threshold enforced)
npm run test:coverage

# Run tests in watch mode for development
npm run test:watch
```

### Test Coverage

The build will fail if test coverage drops below **80%** for any metric:
- **Statements**: 80% minimum
- **Branches**: 80% minimum  
- **Functions**: 80% minimum
- **Lines**: 80% minimum

## Linting & Code Quality

### ESLint Configuration

The project uses **ESLint** with TypeScript-specific rules:

- **TypeScript ESLint**: Enforces TypeScript best practices
- **Code Quality**: Catches common errors and enforces style
- **Pre-commit**: Linting is enforced before commits

### Linting Commands

```bash
# Check for linting issues
npm run lint

# Automatically fix linting issues
npm run lint:fix
```

### Code Quality Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Enforces consistent code style
- **Prettier**: Automatic code formatting
- **Import Organization**: Structured import statements

## Building & Packaging

### Build Process

The lambda function is built using **Webpack** for optimal packaging:

```bash
# Build the function
npm run build

# Clean and rebuild
npm run clean && npm run build
```

### Webpack Configuration

- **TypeScript Compilation**: Transpiles TypeScript to JavaScript
- **Code Minification**: Uses Terser for smaller bundle size
- **Output Optimization**: Creates optimized distribution files

### Packaging

```bash
# Build and package for deployment
npm run build:package

# Creates: dist/crow-detector-s3-lambda.zip
```

## Deployment

### CloudFormation Templates

The lambda function is deployed using AWS CloudFormation:

- **`crow-detector-s3-lambda.yaml`**: Main lambda function and IAM roles
- **`crow-detector-lambda-s3.yaml`**: S3 event notification configuration
- **`crow-detector-sqs.yaml`**: SQS queue and event source mapping

### Deployment Process

1. **Build & Package:**
   ```bash
   npm run build:package
   ```

2. **Upload to S3:**
   ```bash
   aws s3 cp dist/crow-detector-s3-lambda.zip s3://your-lambda-bucket/
   ```

3. **Deploy CloudFormation:**
   ```bash
   aws cloudformation deploy \
     --template-file cloudformation/crow-detector-s3-lambda.yaml \
     --stack-name crow-detector-s3-lambda-dev \
     --parameter-overrides Environment=dev S3Key=crow-detector-s3-lambda.zip
   ```

### Environment Configuration

- **Development**: `https://api-dev.crittercanteen.com`
- **Production**: `https://api.crittercanteen.com`

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `API_BASE_URL` | Base URL for Crow Detector API | Yes |
| `DETECTION_ENDPOINT` | Endpoint for detection events | Yes |
| `FEED_ENDPOINT` | Endpoint for feed events | Yes |
| `NODE_ENV` | Environment (dev/prod) | Yes |
| `LAMBDA_S3_PRIVATE_KEY` | ECDSA private key for API auth | Yes |

### AWS Resources

- **Lambda Function**: `crow-detector-s3-lambda-{environment}`
- **IAM Role**: `crow-detector-s3-lambda-role-{environment}`
- **SQS Queue**: Event source for S3 notifications
- **S3 Bucket**: Source of image upload events

## Monitoring & Logging

### CloudWatch Logs

The lambda function logs to CloudWatch with structured logging:

- **Event Processing**: Logs SQS events and processing results
- **API Calls**: Logs API request/response details
- **Error Handling**: Comprehensive error logging with stack traces

### Metrics

- **Invocation Count**: Number of lambda executions
- **Duration**: Processing time per execution
- **Error Rate**: Percentage of failed executions
- **Throttles**: Number of throttled invocations

### Debugging

For development and debugging:

- **Local Testing**: Use `NODE_ENV=test` to disable verbose logging
- **CloudWatch Insights**: Query logs for specific error patterns
- **X-Ray Tracing**: Enable for detailed request tracing

---

## Integration with Main Server

This lambda function integrates with the main **Crow Detector Server** by:

1. **Triggering Image Processing**: Automatically starts processing when images are uploaded
2. **Maintaining Workflow**: Ensures images flow through the complete AI processing pipeline
3. **Error Handling**: Provides reliable event processing with retry capabilities
4. **Scalability**: Handles high-volume image uploads without overwhelming the main server

For more information about the main server and image processing pipeline, see the [main README.md](../README.md).
