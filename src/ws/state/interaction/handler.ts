import { Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import type { AuthenticatedSocket } from '../../../types/socket';
import { SendInteractionDto } from '../../dto/send-interaction.dto';
import { InteractionPayloadDto } from '../../dto/interaction-payload.dto';
import { PrismaService } from '../../../database/prisma.service';
import { UserSocketService } from '../user-socket.service';
import { WsNotificationService } from '../ws-notification.service';
import { WS_EVENT } from '../ws-events';
import { Validator } from '../utils/validation';

const SENDER_NAME_CACHE_TTL_MS = 10 * 60 * 1000;

export class InteractionHandler {
  private readonly logger = new Logger(InteractionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userSocketService: UserSocketService,
    private readonly wsNotificationService: WsNotificationService,
  ) {}

  private async resolveSenderName(
    client: AuthenticatedSocket,
    userId: string,
  ): Promise<string> {
    const cachedName = client.data.senderName;
    const cachedAt = client.data.senderNameCachedAt;
    const cacheIsFresh =
      cachedName &&
      typeof cachedAt === 'number' &&
      Date.now() - cachedAt < SENDER_NAME_CACHE_TTL_MS;

    if (cacheIsFresh) {
      return cachedName;
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, username: true },
    });

    const senderName = sender?.name || sender?.username || 'Unknown';
    client.data.senderName = senderName;
    client.data.senderNameCachedAt = Date.now();
    return senderName;
  }

  async handleSendInteraction(
    client: AuthenticatedSocket,
    data: SendInteractionDto,
  ) {
    const user = client.data.user;
    const currentUserId = Validator.validateInitialized(client);

    if (!user) {
      throw new WsException('Unauthorized: User not initialized');
    }

    // 1. Verify recipient is a friend
    const friends = client.data.friends;
    if (!friends || !friends.has(data.recipientUserId)) {
      client.emit(WS_EVENT.INTERACTION_DELIVERY_FAILED, {
        recipientUserId: data.recipientUserId,
        reason: 'Recipient is not a friend',
      });
      return;
    }

    // 2. Validate text content length
    if (data.type === 'text' && data.content && data.content.length > 50) {
      client.emit(WS_EVENT.INTERACTION_DELIVERY_FAILED, {
        recipientUserId: data.recipientUserId,
        reason: 'Text content exceeds 50 characters',
      });
      return;
    }

    // 3. Check if recipient is online
    const isOnline = await this.userSocketService.isUserOnline(
      data.recipientUserId,
    );
    if (!isOnline) {
      client.emit(WS_EVENT.INTERACTION_DELIVERY_FAILED, {
        recipientUserId: data.recipientUserId,
        reason: 'Recipient is offline',
      });
      return;
    }

    // 3. Construct payload
    const senderName = await this.resolveSenderName(client, currentUserId);

    const payload: InteractionPayloadDto = {
      senderUserId: currentUserId,
      senderName,
      content: data.content,
      type: data.type,
      timestamp: new Date().toISOString(),
    };

    // 4. Send to recipient
    await this.wsNotificationService.emitToUser(
      data.recipientUserId,
      WS_EVENT.INTERACTION_RECEIVED,
      payload,
    );
  }
}
