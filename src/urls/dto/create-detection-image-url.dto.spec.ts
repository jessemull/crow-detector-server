import { CreateDetectionImageUrlDto } from './create-detection-image-url.dto';
import { ImageFormat } from '../../common/types';
import { validate } from 'class-validator';

describe('CreateDetectionImageUrlDto', () => {
  describe('validation', () => {
    it('should pass validation with valid data', async () => {
      const dto = new CreateDetectionImageUrlDto();
      dto.fileName = 'motion-detected';
      dto.format = ImageFormat.PNG;
      dto.feedEventId = 'feed-123';
      dto.contentType = 'image/png';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation without optional contentType', async () => {
      const dto = new CreateDetectionImageUrlDto();
      dto.fileName = 'motion-detected';
      dto.format = ImageFormat.JPG;
      dto.feedEventId = 'feed-123';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when fileName is missing', async () => {
      const dto = new CreateDetectionImageUrlDto();
      dto.format = ImageFormat.PNG;
      dto.feedEventId = 'feed-123';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation when fileName is empty string', async () => {
      const dto = new CreateDetectionImageUrlDto();
      dto.fileName = '';
      dto.format = ImageFormat.PNG;
      dto.feedEventId = 'feed-123';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation when format is missing', async () => {
      const dto = new CreateDetectionImageUrlDto();
      dto.fileName = 'motion-detected';
      dto.feedEventId = 'feed-123';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation when format is invalid', async () => {
      const dto = new CreateDetectionImageUrlDto();
      dto.fileName = 'motion-detected';
      dto.format = 'invalid-format' as any;
      dto.feedEventId = 'feed-123';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEnum).toBeDefined();
    });

    it('should fail validation when feedEventId is missing', async () => {
      const dto = new CreateDetectionImageUrlDto();
      dto.fileName = 'motion-detected';
      dto.format = ImageFormat.PNG;

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation when feedEventId is empty string', async () => {
      const dto = new CreateDetectionImageUrlDto();
      dto.fileName = 'motion-detected';
      dto.format = ImageFormat.PNG;
      dto.feedEventId = '';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should accept valid ImageFormat values', async () => {
      const validFormats = [
        ImageFormat.JPG,
        ImageFormat.JPEG,
        ImageFormat.PNG,
        ImageFormat.GIF,
        ImageFormat.BMP,
        ImageFormat.WEBP,
      ];

      for (const format of validFormats) {
        const dto = new CreateDetectionImageUrlDto();
        dto.fileName = 'motion-detected';
        dto.format = format;
        dto.feedEventId = 'feed-123';

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should accept valid content type strings', async () => {
      const validContentTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/octet-stream',
      ];

      for (const contentType of validContentTypes) {
        const dto = new CreateDetectionImageUrlDto();
        dto.fileName = 'motion-detected';
        dto.format = ImageFormat.JPG;
        dto.feedEventId = 'feed-123';
        dto.contentType = contentType;

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should accept various feedEventId formats', async () => {
      const validFeedEventIds = [
        'feed-123',
        'feed_456',
        'feed789',
        '12345',
        'uuid-123e4567-e89b-12d3-a456-426614174000',
      ];

      for (const feedEventId of validFeedEventIds) {
        const dto = new CreateDetectionImageUrlDto();
        dto.fileName = 'motion-detected';
        dto.format = ImageFormat.JPG;
        dto.feedEventId = feedEventId;

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });
  });

  describe('properties', () => {
    it('should have fileName property', () => {
      const dto = new CreateDetectionImageUrlDto();
      expect(dto).toHaveProperty('fileName');
    });

    it('should have format property', () => {
      const dto = new CreateDetectionImageUrlDto();
      expect(dto).toHaveProperty('format');
    });

    it('should have feedEventId property', () => {
      const dto = new CreateDetectionImageUrlDto();
      expect(dto).toHaveProperty('feedEventId');
    });

    it('should have optional contentType property', () => {
      const dto = new CreateDetectionImageUrlDto();
      expect(dto).toHaveProperty('contentType');
    });
  });
});
