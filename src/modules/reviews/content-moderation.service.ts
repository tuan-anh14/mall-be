import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface ModerationResult {
  allowed: boolean;
  label: string;
}

@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async moderate(text: string): Promise<ModerationResult> {
    const aiUrl =
      this.configService.get<string>('AI_SERVICE_URL') || 'http://localhost:8001';

    try {
      const response = await firstValueFrom(
        this.httpService.post<ModerationResult>(
          `${aiUrl}/moderate/text`,
          { text },
          { timeout: 3000 },
        ),
      );
      return {
        allowed: response.data.allowed,
        label: response.data.label,
      };
    } catch {
      // mall-ai offline hoặc timeout → fallback an toàn: cho qua
      this.logger.warn('Moderation service unavailable, falling back to allow');
      return { allowed: true, label: 'SAFE' };
    }
  }
}
