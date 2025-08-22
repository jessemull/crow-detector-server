import {
  API_BASE_URL,
  DETECTION_ENDPOINT,
  FEED_ENDPOINT,
  API_TIMEOUT_MS,
  USER_AGENT,
} from '../constants';
import { S3ObjectInfo } from '../types';
import { generateAuthHeaders } from './auth';
import { getImageType } from './images';

export async function callAPI(s3Info: S3ObjectInfo): Promise<void> {
  const imageType = getImageType(s3Info.key);
  const endpoint = imageType === 'feed' ? FEED_ENDPOINT : DETECTION_ENDPOINT;

  const payload = {
    imageUrl: `https://${s3Info.bucket}.s3.amazonaws.com/${s3Info.key}`,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const authHeaders = generateAuthHeaders('POST', endpoint, payload);
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        ...authHeaders,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }

    const responseData = await response.json();

    if (process.env.NODE_ENV !== 'test') {
      console.log(`${imageType} API response:`, response.status, responseData);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
