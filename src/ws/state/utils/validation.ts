import { WsException } from '@nestjs/websockets';
import type { AuthenticatedSocket } from '../../../types/socket';

export class Validator {
  static validateUser(client: AuthenticatedSocket): void {
    if (!client.data.user) {
      throw new WsException('Unauthorized');
    }
  }

  static validateInitialized(client: AuthenticatedSocket): string {
    const userId = client.data.userId;
    if (!userId) {
      throw new WsException('User not initialized');
    }
    return userId;
  }

  static validateActiveDoll(client: AuthenticatedSocket): void {
    if (!client.data.activeDollId) {
      throw new WsException('No active doll');
    }
  }
}
