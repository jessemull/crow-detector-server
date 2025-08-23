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
    const apiKey = this.configService.get<string>('CLAUDE_API_KEY');
    this.logger.info(`CLAUDE_API_KEY loaded: ${apiKey ? 'YES' : 'NO'}`);
    if (apiKey) {
      this.logger.info(`API key starts with: ${apiKey.substring(0, 10)}...`);
    }

    if (!apiKey) {
      this.logger.warn('CLAUDE_API_KEY not found in environment variables');
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey || 'dummy-key',
    });
  }

  private getClaudeModel(): string {
    return (
      this.configService.get<string>('CLAUDE_MODEL') || 'claude-3-opus-20240229'
    );
  }

  async analyzeAnimalDetection(
    labels: RekognitionLabel[],
  ): Promise<AnimalAnalysisResult> {
    try {
      if (!this.configService.get<string>('CLAUDE_API_KEY')) {
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

CRITICAL: Count individual animals using the Instances data, not just label names.

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
- crowCount: Count individual crows/blackbirds (if Bird has 2 instances, that's 2 crows)
- animalCount: Sum of all individual animals (Bird instances + Pig instances)
- detectedAnimals: Array of objects with animal name, confidence score, and instance count

Example: Bird with 2 instances + Pig with 1 instance = 3 total animals, 2 crows.
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
