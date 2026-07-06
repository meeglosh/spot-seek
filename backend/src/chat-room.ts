/**
 * ChatRoom Durable Object — one instance per event, keyed by event ID.
 * Uses the Hibernation API so idle rooms don't consume memory.
 *
 * Protocol:
 *   Client connects via WS: GET /api/chat/:eventId/ws?token=<better-auth-session-token>
 *   Client sends:  JSON { type: "message", body: "text" }
 *   Server broadcasts: JSON { type: "message", userId, body, timestamp }
 *   Server sends:  JSON { type: "history", comments: [...] } on connect
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, asc } from 'drizzle-orm';
import * as schema from './schema';

type WsAttachment = { userId: string; eventId: string };

export class ChatRoom implements DurableObject {
  private ctx: DurableObjectState;
  private env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const eventId = url.searchParams.get('eventId') ?? '';
    const userId = url.searchParams.get('userId') ?? 'anonymous';

    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const attachment: WsAttachment = { userId, eventId };
    this.ctx.acceptWebSocket(server, [JSON.stringify(attachment)]);

    // Send recent history on connect.
    const db = drizzle(neon(this.env.DATABASE_URL), { schema });
    const history = await db.query.comments.findMany({
      where: eq(schema.comments.eventId, eventId),
      orderBy: asc(schema.comments.createdAt),
    });
    server.send(JSON.stringify({ type: 'history', comments: history }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const attachment: WsAttachment = tags[0] ? JSON.parse(tags[0]) : {};
    const { userId, eventId } = attachment;

    let msg: { type?: string; body?: string };
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    if (msg.type !== 'message' || !msg.body?.trim()) return;

    // Persist to DB.
    const db = drizzle(neon(this.env.DATABASE_URL), { schema });
    const [comment] = await db
      .insert(schema.comments)
      .values({ eventId, userId, body: msg.body.trim() })
      .returning();

    const broadcast = JSON.stringify({ type: 'message', ...comment });
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(broadcast);
    }
  }

  webSocketClose(ws: WebSocket): void {
    ws.close();
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    console.error('[ChatRoom] WebSocket error:', error);
    ws.close();
  }
}
