import { Anthropic } from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { createLogger } from '../../common/logger/logger.config';

import { AnimalAnalysisResult, RekognitionLabel } from '../../common/types';

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
    return (
      this.configService.get<string>('claudeModel') || 'claude-3-opus-20240229'
    );
  }

  async analyzeAnimalDetection(
    labels: RekognitionLabel[],
  ): Promise<AnimalAnalysisResult> {
    try {
      if (!this.configService.get<string>('claudeApiKey')) {
        throw new Error('Claude API key not configured');
      }

      const labelsText = labels
        .filter((label) => label.Name && label.Confidence)
        .map((label) => {
          const instanceCount = label.Instances ? label.Instances.length : 0;
          return `${label.Name} (${label.Confidence}%) - ${instanceCount} instance${instanceCount !== 1 ? 's' : ''}`;
        })
        .join(', ');

      const prompt = `Analyze these image labels and determine if any animals are present. Focus on identifying crows specifically.

Labels: ${labelsText}

CRITICAL: Count creatures, not label names. Rekognition repeats parent categories for the same creature.

IMPORTANT: You must respond with ONLY valid JSON. No additional text, explanations, or markdown formatting.

Required JSON structure:
{
  "hasAnimals": boolean,
  "crowCount": number,
  "animalCount": number,
  "detectedAnimals": [
    {
      "name": "string",
      "confidence": number,
      "count": number
    }
  ]
}

COUNTING RULES:
- Animal, Bird, Blackbird, and Crow together are one bird, not four animals.
- Ignore a broad label (Animal, Wildlife, Pet, Bird, Mammal, and similar) when a more specific label is present.
- animalCount is the number of creatures. Use Instances on the most specific label.
- crowCount counts only crows, ravens, blackbirds, and other corvids. A generic Bird is not a crow.
- detectedAnimals lists only the specific labels you counted.

Example: Animal (1), Bird (1), Blackbird (1), Crow (1) = 1 animal, 1 crow.
detectedAnimals: [{"name": "Crow", "confidence": 92, "count": 1}]

Example: Animal (1), Mammal (1) = 1 animal, 0 crows.
detectedAnimals: [{"name": "Mammal", "confidence": 99, "count": 1}]

Example: Bird (2 instances), Pig (1 instance) = 3 animals, 0 crows.
detectedAnimals: [{"name": "Bird", "confidence": 99.1, "count": 2}, {"name": "Pig", "confidence": 99.2, "count": 1}]`;

      const message = await this.anthropic.messages.create({
        model: this.getClaudeModel(),
        max_tokens: 1000,
        temperature: 0.1, // Low temperature for consistent JSON responses
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        system:
          'You are an expert at analyzing image detection results and counting animals. Always respond with valid JSON in the exact format requested.',
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        this.logger.error(
          `Unexpected response type from Claude: ${content.type}`,
        );
        throw new Error('Unexpected response type from Claude');
      }

      const responseText = content.text.trim();
      this.logger.info(`Raw Claude response: ${responseText}`);

      // Try to extract JSON from the response...

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const result = JSON.parse(jsonMatch[0]) as AnimalAnalysisResult;

      // Validate the result structure...

      if (
        typeof result.hasAnimals !== 'boolean' ||
        typeof result.crowCount !== 'number' ||
        typeof result.animalCount !== 'number' ||
        !Array.isArray(result.detectedAnimals)
      ) {
        throw new Error('Invalid response structure from Claude');
      }

      this.logger.info(
        `Claude analysis completed: ${result.animalCount} animals, ${result.crowCount} crows`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Claude analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
