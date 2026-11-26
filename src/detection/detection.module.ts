import { Module } from '@nestjs/common';
import { ClaudeService } from './services/claude.service';

@Module({
  exports: [ClaudeService],
  providers: [ClaudeService],
})
export class DetectionModule {}
