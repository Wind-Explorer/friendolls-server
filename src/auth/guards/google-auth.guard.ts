import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('google SSO is not configured');
    }

    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ query: { state?: string } }>();

    return {
      state: request.query.state,
      accessType: 'offline',
      prompt: 'consent',
    };
  }

  private isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('GOOGLE_CLIENT_ID') &&
        this.configService.get<string>('GOOGLE_CLIENT_SECRET') &&
        this.configService.get<string>('GOOGLE_CALLBACK_URL'),
    );
  }
}
