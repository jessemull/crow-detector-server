# Crow Detector S3 Event Lambda

This Lambda function processes SQS messages containing S3 event data when images are uploaded to the crow detector S3 bucket and calls the Crow Detector API to trigger detection processing.

## Overview

When an image is uploaded to the S3 bucket (`crow-detector-images-{env}`), the system:

1. **S3 sends event notifications** to an SQS queue for `ObjectCreated:Put` and `ObjectCreated:Post` events
2. **Lambda processes SQS messages** containing S3 event data
3. **Filters for image files** (jpg, jpeg, png, gif, bmp, webp)
4. **Calls the Crow Detector API** with the image URL and metadata
5. **Logs all processing results** for monitoring and debugging

## Architecture

The system uses a queue-based architecture for robust event processing:

```
S3 Bucket → SQS Queue → Lambda Function → Crow Detector API
   (with       ↓              ↑
 notifications) Dead Letter Queue (DLQ)
```

### Benefits of SQS Architecture

- **Reliability** - Messages are persisted until processed
- **Retry mechanism** - Automatic retries with configurable count
- **Dead Letter Queue** - Failed messages are moved to DLQ for investigation
- **Scalability** - Lambda can process multiple messages in parallel
- **Decoupling** - S3 and Lambda are not directly coupled

## Features

- **Queue-based processing** - SQS messages with automatic retries and DLQ
- **Automatic image detection** - Only processes image file uploads
- **Event filtering** - Ignores non-upload events (deletions, etc.)
- **API integration** - Calls the detection API with proper payload using native fetch
- **Error handling** - Graceful failure handling and logging
- **Environment configuration** - Supports dev/prod environments
- **Modern Node.js** - Uses native fetch API (Node.js 20+) for smaller bundle size

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | Base URL for the Crow Detector API | `https://api-dev.crittercanteen.com` |
| `API_ENDPOINT` | API endpoint for detection events | `/detection/crow-detected-event` |
| `NODE_ENV` | Node.js environment | `development` |

## API Payload

The Lambda sends the following payload to the API:

```json
{
  "imageUrl": "https://bucket.s3.amazonaws.com/image.jpg",
  "confidence": 0.85,
  "timestamp": 1234567890,
  "source": "s3-lambda",
  "metadata": {
    "bucket": "crow-detector-images-dev",
    "key": "detection/image.jpg",
    "size": 1024,
    "eventName": "ObjectCreated:Put"
  }
}
```

## Development

### Prerequisites

- Node.js 20+ (for native fetch support)
- npm

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Build the function:**
   ```bash
   npm run build
   ```

4. **Package for deployment:**
   ```bash
   npm run package
   ```

### Scripts

- `npm run build` - Build the Lambda function
- `npm run clean` - Clean build artifacts
- `npm test` - Run unit tests
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Lint the code
- `npm run package` - Create deployment package

## Testing

The test suite covers:

- ✅ **SQS message processing** - Various S3 event types and scenarios
- ✅ **Image file filtering** - Different image extensions and cases
- ✅ **API integration** - Successful calls and error handling
- ✅ **Environment variables** - Default values and overrides
- ✅ **Error handling** - Graceful failure scenarios

Run tests with:
```bash
npm test
npm run test:coverage
```

## Deployment

### Manual Deployment

1. **Build and package:**
   ```bash
   npm run build:package
   ```

2. **Upload to S3:**
   ```bash
   aws s3 cp dist/crow-detector-s3-lambda.zip s3://your-bucket/lambda/
   ```

3. **Deploy CloudFormation templates (in order):**
   ```bash
   # Deploy SQS infrastructure first
   aws cloudformation deploy \
     --template-file lambda/cloudformation/crow-detector-sqs.yaml \
     --stack-name crow-detector-sqs-stack-dev \
     --parameter-overrides Environment=dev \
     --capabilities CAPABILITY_NAMED_IAM
   
   # Deploy/Update S3 bucket with SQS notifications
   aws cloudformation deploy \
     --template-file cloudformation/crow-detector-s3.yaml \
     --stack-name crow-detector-s3-stack-dev \
     --parameter-overrides Environment=dev \
     --capabilities CAPABILITY_NAMED_IAM
   
   # Deploy Lambda function
   aws cloudformation deploy \
     --template-file lambda/cloudformation/crow-detector-s3-lambda.yaml \
     --stack-name crow-detector-s3-lambda-stack-dev \
     --parameter-overrides Environment=dev S3Key=lambda/crow-detector-s3-lambda.zip \
     --capabilities CAPABILITY_NAMED_IAM
   ```

### GitHub Actions

Use the GitHub Actions workflow for automated deployment:

1. Go to **Actions** → **Deploy Lambda**
2. Select environment (dev/prod)
3. Click **Run workflow**

## CloudFormation Resources

The system uses multiple CloudFormation templates:

### Lambda Template (`crow-detector-s3-lambda.yaml`)
- **Lambda Function** - Main SQS message processor
- **IAM Role** - Execution permissions for Lambda
- **Lambda Version** - Versioned function for rollbacks
- **SQS Permission** - Allows SQS to invoke Lambda
- **Event Source Mapping** - Connects SQS queue to Lambda

### SQS Template (`crow-detector-sqs.yaml`)
- **SQS Queue** - Main queue for S3 event messages
- **Dead Letter Queue** - For failed message processing
- **Retry Policy** - Configurable retry count and visibility timeout

### S3 Bucket Configuration (`cloudformation/crow-detector-s3.yaml`)
- **S3 Bucket Notification** - Automatically sends events to SQS queue
- **Event Filtering** - Only image file uploads trigger notifications (jpg, jpeg, png, gif, bmp, webp)
- **SQS Queue Policy** - Allows S3 bucket to send messages to SQS queue

## Monitoring

### CloudWatch Logs

Monitor the Lambda function through CloudWatch Logs:
- **Log Group:** `/aws/lambda/crow-detector-s3-lambda-{env}`
- **Log Streams:** Individual execution logs

### Metrics

Key metrics to monitor:
- **Invocation count** - Number of S3 events processed
- **Error rate** - Failed API calls or processing errors
- **Duration** - Processing time per event
- **Throttles** - Lambda concurrency limits

## Troubleshooting

### Common Issues

1. **API call failures** - Check API endpoint availability and authentication
2. **SQS message processing** - Check DLQ for failed messages and retry count
3. **S3 permissions** - Verify S3 bucket can send notifications to SQS
4. **Lambda permissions** - Verify Lambda can read from SQS queue
5. **Timeout errors** - Increase Lambda timeout for large images
6. **Memory issues** - Adjust Lambda memory allocation

### Debug Steps

1. **Check CloudWatch logs** for error details
2. **Check SQS queue metrics** for message processing status
3. **Check Dead Letter Queue** for failed messages
4. **Verify environment variables** are set correctly
5. **Test API endpoint** manually to ensure it's accessible
6. **Check S3 bucket notifications** are configured properly
7. **Verify SQS event source mapping** is enabled

## Security

- **IAM roles** - Least privilege access to SQS, S3, and CloudWatch
- **Environment isolation** - Separate dev/prod configurations
- **Input validation** - Sanitized SQS message processing
- **Secure API calls** - HTTPS-only API communication
- **Queue encryption** - SQS messages are encrypted at rest

## Contributing

1. **Follow existing patterns** - Use similar structure to other Lambda functions
2. **Add tests** - Ensure new features have test coverage
3. **Update documentation** - Keep README current with changes
4. **Follow linting rules** - Use `npm run lint:fix` before committing
