import { CreateFeedImageUrlDto } from './create-feed-image-url.dto';
import { ImageFormat } from '../../common/types';
import { validate } from 'class-validator';

describe('CreateFeedImageUrlDto', () => {
  describe('validation', () => {
    it('should pass validation with valid data', async () => {
      const dto = new CreateFeedImageUrlDto();
      dto.fileName = 'test-image';
      dto.format = ImageFormat.JPG;
      dto.source = 'pi-feeder-001';
      dto.contentType = 'image/jpeg';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation without optional contentType', async () => {
      const dto = new CreateFeedImageUrlDto();
      dto.fileName = 'test-image';
      dto.format = ImageFormat.PNG;
      dto.source = 'pi-feeder-001';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when fileName is missing', async () => {
      const dto = new CreateFeedImageUrlDto();
      dto.format = ImageFormat.JPG;
      dto.source = 'pi-feeder-001';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation when fileName is empty string', async () => {
      const dto = new CreateFeedImageUrlDto();
      dto.fileName = '';
      dto.format = ImageFormat.JPG;
      dto.source = 'pi-feeder-001';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation when format is missing', async () => {
      const dto = new CreateFeedImageUrlDto();
      dto.fileName = 'test-image';
      dto.source = 'pi-feeder-001';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation when format is invalid', async () => {
      const dto = new CreateFeedImageUrlDto();
      dto.fileName = 'test-image';
      dto.format = 'invalid-format' as any;
      dto.source = 'pi-feeder-001';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEnum).toBeDefined();
    });

    it('should fail validation when source is missing', async () => {
      const dto = new CreateFeedImageUrlDto();
      dto.fileName = 'test-image';
      dto.format = ImageFormat.JPG;

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should fail validation when source is empty string', async () => {
      const dto = new CreateFeedImageUrlDto();
      dto.fileName = 'test-image';
      dto.format = ImageFormat.JPG;
      dto.source = '';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should accept valid ImageFormat values', async () => {
      const validFormats = [ImageFormat.JPG, ImageFormat.JPEG, ImageFormat.PNG];

      for (const format of validFormats) {
        const dto = new CreateFeedImageUrlDto();
        dto.fileName = 'test-image';
        dto.format = format;
        dto.source = 'pi-feeder-001';

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
        const dto = new CreateFeedImageUrlDto();
        dto.fileName = 'test-image';
        dto.format = ImageFormat.JPG;
        dto.source = 'pi-feeder-001';
        dto.contentType = contentType;

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });
  });

  describe('properties', () => {
    it('should have fileName property', () => {
      const dto = new CreateFeedImageUrlDto();
      expect(dto).toHaveProperty('fileName');
    });

    it('should have format property', () => {
      const dto = new CreateFeedImageUrlDto();
      expect(dto).toHaveProperty('format');
    });

    it('should have source property', () => {
      const dto = new CreateFeedImageUrlDto();
      expect(dto).toHaveProperty('source');
    });

    it('should have optional contentType property', () => {
      const dto = new CreateFeedImageUrlDto();
      expect(dto).toHaveProperty('contentType');
    });
  });
});
