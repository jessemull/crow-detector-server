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

    it('should pass validation when only required fields are provided', async () => {
      const dto = new CreateDetectionImageUrlDto();
      dto.fileName = 'motion-detected';
      dto.format = ImageFormat.PNG;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
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
        dto.contentType = contentType;

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

    it('should have optional contentType property', () => {
      const dto = new CreateDetectionImageUrlDto();
      expect(dto).toHaveProperty('contentType');
    });
  });
});
