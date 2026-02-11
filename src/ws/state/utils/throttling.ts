export class Throttler {
  private lastBroadcastMap: Map<string, number> = new Map();

  isThrottled(userId: string, throttleMs: number): boolean {
    const now = Date.now();
    const lastBroadcast = this.lastBroadcastMap.get(userId) || 0;
    if (now - lastBroadcast < throttleMs) {
      return true;
    }
    this.lastBroadcastMap.set(userId, now);
    return false;
  }

  remove(userId: string) {
    this.lastBroadcastMap.delete(userId);
  }
}
