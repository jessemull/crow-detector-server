import { Anthropic } from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { createLogger } from '../../common/logger/logger.config';

export interface AnimalAnalysisResult {
  hasAnimals: boolean;
  crowCount: number;
  animalCount: number;
  detectedAnimals: string[];
}

@Injectable()
export class ClaudeService {
  private readonly logger = createLogger(ClaudeService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('CLAUDE_API_KEY');
    if (!apiKey) {
      this.logger.warn('CLAUDE_API_KEY not found in environment variables');
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey || 'dummy-key',
    });
  }

  async analyzeAnimalDetection(
    labels: Array<{ Name?: string; Confidence?: number }>,
  ): Promise<AnimalAnalysisResult> {
    try {
      if (!this.configService.get<string>('CLAUDE_API_KEY')) {
        throw new Error('Claude API key not configured');
      }

      const labelsText = labels
        .filter((label) => label.Name && label.Confidence)
        .map((label) => `${label.Name} (${label.Confidence}%)`)
        .join(', ');

      const prompt = `Analyze these image labels and determine if any animals are present. Focus on identifying crows specifically.

Labels: ${labelsText}

Return ONLY valid JSON with this exact structure:
{
  "hasAnimals": boolean,
  "crowCount": number,
  "animalCount": number,
  "detectedAnimals": string[]
}

Rules:
- hasAnimals: true if ANY animals are detected
- crowCount: count of crows, ravens, blackbirds, corvids, or similar birds
- animalCount: total count of all animals (including crows)
- detectedAnimals: array of all animal names found

Be comprehensive - if you see "Bird", "Mammal", "Pet", "Wildlife", etc., these likely indicate animals.`;

      const message = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const responseText = content.text.trim();

      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const result = JSON.parse(jsonMatch[0]) as AnimalAnalysisResult;

      // Validate the result structure
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
