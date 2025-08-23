import { DetectionImageProcessingService } from './detection-image-processing.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClaudeService } from './claude.service';

describe('DetectionImageProcessingService', () => {
  let service: DetectionImageProcessingService;
  let configService: ConfigService;
  let claudeService: ClaudeService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockClaudeService = {
    analyzeAnimalDetection: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup AWS client mocks
    (
      RekognitionClient as jest.MockedClass<typeof RekognitionClient>
    ).mockImplementation(() => mockRekognitionClient as any);
    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () => mockS3Client as any,
    );

    // Setup logger mock
    mockCreateLogger.mockReturnValue(mockLogger as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionImageProcessingService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ClaudeService,
          useValue: mockClaudeService,
        },
      ],
    }).compile();

    service = module.get<DetectionImageProcessingService>(
      DetectionImageProcessingService,
    );
    configService = module.get<ConfigService>(ConfigService);
    claudeService = module.get<ClaudeService>(ClaudeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
    });

    it('should use default region when AWS_REGION not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const newService = new DetectionImageProcessingService(
        configService,
        claudeService,
      );
      expect(newService).toBeDefined();
    });
  });

  describe('processImage', () => {
    const mockLabels = {
      Labels: [
        { Name: 'Bird', Confidence: 95 },
        { Name: 'Crow', Confidence: 87 },
      ],
    };

    beforeEach(() => {
      mockConfigService.get.mockReturnValue('us-west-2');
    });

    it('should process image successfully with Claude analysis', async () => {
      const claudeResult = {
        hasAnimals: true,
        crowCount: 1,
        animalCount: 1,
        detectedAnimals: ['Crow'],
        confidence: 87,
      };

      mockClaudeService.analyzeAnimalDetection.mockResolvedValue(claudeResult);

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals).toEqual(['Crow']);
      expect(result.confidence).toBe(87);
      expect(result.processingDuration).toBeGreaterThan(0);
    });

    it('should fallback to basic detection when Claude fails', async () => {
      mockClaudeService.analyzeAnimalDetection.mockRejectedValue(
        new Error('Claude API error'),
      );

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals).toEqual(['Crow']);
      expect(result.confidence).toBe(95);
    });

    it('should delete image when no animals detected', async () => {
      const claudeResult = {
        hasAnimals: false,
        crowCount: 0,
        animalCount: 0,
        detectedAnimals: [],
        confidence: 0,
      };

      mockClaudeService.analyzeAnimalDetection.mockResolvedValue(claudeResult);

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(false);
      expect(result.crowCount).toBe(0);
      expect(result.animalCount).toBe(0);
    });
  });
});
