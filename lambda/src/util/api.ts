import {
  requireApiBaseUrl,
  DETECTION_ENDPOINT,
  FEED_ENDPOINT,
  API_TIMEOUT_MS,
  USER_AGENT,
} from '../constants';
import { S3ObjectInfo } from '../types';
import { generateAuthHeaders } from './auth';
import { getImageType } from './images';
import { lambdaLogger } from './logger';

export async function callAPI(s3Info: S3ObjectInfo): Promise<void> {
  const imageType = getImageType(s3Info.key);
  const endpoint = imageType === 'feed' ? FEED_ENDPOINT : DETECTION_ENDPOINT;

  const encodedKey = s3Info.key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const payload = {
    imageUrl: `https://${s3Info.bucket}.s3.amazonaws.com/${encodedKey}`,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const authHeaders = generateAuthHeaders('POST', endpoint, payload);
    const response = await fetch(`${requireApiBaseUrl()}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        ...authHeaders,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.status === 409) {
      clearTimeout(timeoutId);
      lambdaLogger.info('API conflict is final and will not be retried', {
        imageType,
        status: 409,
      });
      return;
    }

    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }

    await response.json();
    clearTimeout(timeoutId);

    lambdaLogger.info('API call succeeded', {
      imageType,
      status: response.status,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
