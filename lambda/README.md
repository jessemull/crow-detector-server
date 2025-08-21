# Crow Detector S3 Event Lambda

This Lambda function automatically processes S3 events when images are uploaded to the crow detector S3 bucket and calls the Crow Detector API to trigger detection processing.

## Overview

When an image is uploaded to the S3 bucket (`crow-detector-images-{env}`), this Lambda function:

1. **Receives S3 event notifications** for `ObjectCreated:Put` and `ObjectCreated:Post` events
2. **Filters for image files** (jpg, jpeg, png, gif, bmp, webp)
3. **Calls the Crow Detector API** with the image URL and metadata
4. **Logs all processing results** for monitoring and debugging

## Architecture

```
S3 Bucket → S3 Event → Lambda Function → Crow Detector API
```

## Features

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

- ✅ **S3 event processing** - Various event types and scenarios
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

3. **Deploy CloudFormation:**
   ```bash
   aws cloudformation deploy \
     --template-file cloudformation/crow-detector-s3-lambda.yaml \
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

The CloudFormation template creates:

- **Lambda Function** - Main S3 event processor
- **IAM Role** - Execution permissions for Lambda
- **Lambda Version** - Versioned function for rollbacks
- **S3 Permission** - Allows S3 to invoke Lambda

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
2. **S3 permissions** - Verify Lambda has read access to S3 bucket
3. **Timeout errors** - Increase Lambda timeout for large images
4. **Memory issues** - Adjust Lambda memory allocation

### Debug Steps

1. **Check CloudWatch logs** for error details
2. **Verify environment variables** are set correctly
3. **Test API endpoint** manually to ensure it's accessible
4. **Check S3 bucket notifications** are configured properly

## Security

- **IAM roles** - Least privilege access to S3 and CloudWatch
- **Environment isolation** - Separate dev/prod configurations
- **Input validation** - Sanitized S3 event processing
- **Secure API calls** - HTTPS-only API communication

## Contributing

1. **Follow existing patterns** - Use similar structure to other Lambda functions
2. **Add tests** - Ensure new features have test coverage
3. **Update documentation** - Keep README current with changes
4. **Follow linting rules** - Use `npm run lint:fix` before committing
