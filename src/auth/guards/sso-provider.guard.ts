import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { SSO_PROVIDERS } from '../dto/sso-provider';

@Injectable()
export class SsoProviderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ params: { provider?: string } }>();
    const provider = request.params.provider;

    if (
      !provider ||
      !SSO_PROVIDERS.includes(provider as (typeof SSO_PROVIDERS)[number])
    ) {
      throw new BadRequestException('Unsupported SSO provider');
    }

    return true;
  }
}
