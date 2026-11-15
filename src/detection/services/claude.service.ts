import { Anthropic } from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { createLogger } from '../../common/logger/logger.config';

import { AnimalAnalysisResult, DetectedAnimal } from '../../common/types';

const HAIKU_MODEL = 'claude-haiku-5-5';

export type AnimalPhotoMediaType =
  'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

@Injectable()
export class ClaudeService {
  private readonly logger = createLogger(ClaudeService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('claudeApiKey');

    if (!apiKey) {
      this.logger.warn('CLAUDE_API_KEY not found in environment variables');
    } else {
      this.logger.info('CLAUDE_API_KEY loaded');
    }

    // Do not construct the SDK with a dummy key — callers must check configuration.
    this.anthropic = new Anthropic({
      apiKey: apiKey || '',
    });
  }

  private getClaudeModel(): string {
    return this.configService.get<string>('claudeModel') || HAIKU_MODEL;
  }

  async analyzeAnimalPhoto(
    image: Buffer,
    mediaType: AnimalPhotoMediaType,
  ): Promise<AnimalAnalysisResult> {
    try {
      if (!this.configService.get<string>('claudeApiKey')) {
        throw new Error('Claude API key not configured');
      }

      const prompt = `Look at this photo and count the living animals.

Respond with ONLY valid JSON. No markdown.

{
  "hasAnimals": boolean,
  "crowCount": number,
  "animalCount": number,
  "detectedAnimals": [
    { "name": "string", "confidence": number, "count": number }
  ]
}

Rules:
- animalCount is how many living animals are in the photo. A raccoon and a cat are two animals.
- Name each kind with its everyday name, such as raccoon, squirrel, skunk, deer, cardinal, or whale.
- Do not name a body part. A cardinal is a cardinal, not a beak.
- crowCount counts only crows, ravens, and blackbirds. A cardinal or any other bird is not a crow.
- Statues, toys, stuffed animals, drawings, and people in costumes are not animals.
- confidence is from 0 to 100.
- If there are no living animals, hasAnimals is false, both counts are 0, and detectedAnimals is empty.`;

      const message = await this.anthropic.messages.create({
        model: this.getClaudeModel(),
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: image.toString('base64'),
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
        system:
          'You look at a photo and count the living animals in it. Always respond with valid JSON in the exact format requested.',
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        this.logger.error(
          `Unexpected response type from Claude: ${content.type}`,
        );
        throw new Error('Unexpected response type from Claude');
      }

      const responseText = content.text.trim();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const result = JSON.parse(jsonMatch[0]) as AnimalAnalysisResult;
      if (!this.isAnalysisResult(result)) {
        throw new Error('Invalid response structure from Claude');
      }

      const normalized = this.normalize(result);
      this.logger.info(
        `Claude analysis completed: ${normalized.animalCount} animals, ${normalized.crowCount} crows`,
      );
      return normalized;
    } catch (error) {
      this.logger.error(
        `Claude analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private isAnalysisResult(value: unknown): value is AnimalAnalysisResult {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const result = value as AnimalAnalysisResult;
    return (
      typeof result.hasAnimals === 'boolean' &&
      typeof result.crowCount === 'number' &&
      Number.isFinite(result.crowCount) &&
      typeof result.animalCount === 'number' &&
      Number.isFinite(result.animalCount) &&
      Array.isArray(result.detectedAnimals) &&
      result.detectedAnimals.every((animal) => this.isDetectedAnimal(animal))
    );
  }

  private isDetectedAnimal(value: unknown): value is DetectedAnimal {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const animal = value as DetectedAnimal;
    return (
      typeof animal.name === 'string' &&
      typeof animal.confidence === 'number' &&
      Number.isFinite(animal.confidence) &&
      typeof animal.count === 'number' &&
      Number.isFinite(animal.count)
    );
  }

  private normalize(result: AnimalAnalysisResult): AnimalAnalysisResult {
    const detectedAnimals = result.detectedAnimals
      .map((animal) => ({
        name: animal.name.trim(),
        confidence: Math.min(100, Math.max(0, animal.confidence)),
        count: Math.round(animal.count),
      }))
      .filter((animal) => animal.name.length > 0 && animal.count > 0);
    const animalCount = detectedAnimals.reduce(
      (sum, animal) => sum + animal.count,
      0,
    );

    // A crow count that does not match the names stored a squirrel as a crow.

    const crowCount = detectedAnimals
      .filter((animal) => this.isCrowName(animal.name))
      .reduce((sum, animal) => sum + animal.count, 0);

    return {
      hasAnimals: animalCount > 0,
      crowCount,
      animalCount,
      detectedAnimals,
    };
  }

  private isCrowName(name: string): boolean {
    const normalized = name.toLowerCase();
    return ['crow', 'raven', 'blackbird', 'corvid'].some((term) =>
      normalized.includes(term),
    );
  }
}
