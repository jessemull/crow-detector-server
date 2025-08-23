export interface S3ObjectInfo {
  bucket: string;
  eventName: string;
  key: string;
  size: number;
}

export interface S3EventFromSQS {
  Records: Array<{
    eventName: string;
    s3: {
      bucket: {
        name: string;
      };
      object: {
        key: string;
        size?: number;
      };
    };
  }>;
}
