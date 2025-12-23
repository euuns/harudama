import { Router, Request, Response } from 'express';
import 'dotenv/config';
import OpenAI from 'openai';
import crypto from 'crypto';
import { pool } from '../db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getRedis } from '../redis';

/* =====================
 * 타입
 * ===================== */

type ChatRole = 'user' | 'assistant';

interface ChatRoomRow extends RowDataPacket {
  id: number;
  user_id: string;
  title: string | null;
  created_at: Date;
}

type RoomItem = {
  id: number;
  title: string | null;
  createdAt: string;
};

type ChatItem = {
  role: ChatRole;
  content: string;
  ts: number;
};

/* =====================
 * OpenAI
 * ===================== */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

/**
 * LLM 호출
 * - history: Redis에서 가져온 최근 메시지들
 */
async function callLLM(
  history: { role: ChatRole; content: string }[],
  userMessage: string,
): Promise<string> {
  if (!OPENAI_API_KEY) return 'OpenAI API 키가 설정되어 있지 않습니다.';

  const historyText = history
    .map((m) => (m.role === 'user' ? `사용자: ${m.content}` : `AI: ${m.content}`))
    .join('\n');

  const prompt = `
너는 사용자의 일상, 일정, 운동, 고민을 들어주고 답변하는 한국어 비서야.
항상 자연스럽고 친절한 한국어로 대답해.

아래는 지금까지의 대화야.

${historyText ? historyText + '\n' : ''}
사용자: ${userMessage}
AI:
`.trim();

  const response = await openai.responses.create({
    model: 'gpt-5-mini',
    input: prompt,
    max_output_tokens: 2048,
  });

  const text = (response as any).output_text as string | undefined;
  return (text ?? '').trim();
}

/* =====================
 * 유틸
 * ===================== */

function getUserId(req: Request): string | null {
  const userId = (req.body?.userId ?? req.query?.userId) as string | undefined;
  if (!userId || !String(userId).trim()) return null;
  return String(userId).trim();
}

async function assertRoomOwner(roomId: number, userId: string): Promise<void> {
  const [rows] = await pool.query<ChatRoomRow[]>(
    `SELECT id, user_id FROM chat_room WHERE id = ? LIMIT 1`,
    [roomId],
  );

  if (!rows.length) {
    const e: any = new Error('ROOM_NOT_FOUND');
    e.status = 404;
    throw e;
  }

  if (rows[0].user_id !== userId) {
    const e: any = new Error('FORBIDDEN_ROOM');
    e.status = 403;
    throw e;
  }
}

/* =====================
 * Redis: 메시지 저장/조회
 * ===================== */

const CHAT_LIST_LIMIT = Number(process.env.CHAT_LIST_LIMIT ?? 50); // 방당 최근 50개 유지
const CHAT_TTL_SEC = Number(process.env.CHAT_TTL_SEC ?? 60 * 60 * 24 * 7); // 기본 7일

function chatKey(roomId: number) {
  return `chat:${roomId}`;
}

/**
 * 메시지 1개 push (최근 N개 유지 + TTL)
 * - LPUSH로 최신이 앞에 쌓임
 */
async function pushChat(roomId: number, role: ChatRole, content: string) {
  const redis = await getRedis();
  const key = chatKey(roomId);

  const payload: ChatItem = {
    role,
    content,
    ts: Date.now(),
  };

  await redis.lPush(key, JSON.stringify(payload));
  await redis.lTrim(key, 0, CHAT_LIST_LIMIT - 1);
  await redis.expire(key, CHAT_TTL_SEC);
}

/**
 * 히스토리 조회 (오래된→최신 순으로 반환)
 */
async function getChatHistory(roomId: number, limit = 20): Promise<ChatItem[]> {
  const redis = await getRedis();
  const key = chatKey(roomId);

  const raw = await redis.lRange(key, 0, Math.max(0, limit - 1));
  const items: ChatItem[] = [];

  for (const s of raw) {
    try {
      const obj = JSON.parse(s) as ChatItem;
      if (obj && (obj.role === 'user' || obj.role === 'assistant') && typeof obj.content === 'string') {
        items.push(obj);
      }
    } catch {
      // ignore bad payload
    }
  }

  // 현재 items는 최신→과거 순(LPUSH 기반)이므로 reverse
  return items.reverse();
}

/**
 * 전체 로그 조회 (UI용) - limit 만큼
 */
async function getChatLog(roomId: number, limit = 50): Promise<ChatItem[]> {
  return getChatHistory(roomId, limit);
}

/* =====================
 * Router
 * ===================== */

const router = Router();

/**
 * POST /api/chat/anon
 * - 비로그인 유저 식별자 발급 (기기/브라우저에 저장해서 계속 사용)
 */
router.post('/anon', (_req: Request, res: Response) => {
  // Node 버전 이슈 피하려면 randomBytes 사용
  const userId = 'anon_' + crypto.randomBytes(16).toString('hex');
  return res.json({ ok: true, userId });
});

/**
 * POST /api/chat/room
 * body: { userId, title? }
 */
router.post('/room', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, error: 'MISSING_USER' });

    const title = (req.body?.title as string | undefined)?.trim() || null;
    const now = new Date();

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO chat_room (user_id, title, created_at) VALUES (?, ?, ?)`,
      [userId, title, now],
    );

    return res.json({
      ok: true,
      room: {
        id: result.insertId,
        userId,
        title,
        createdAt: now.toISOString(),
      },
    });
  } catch (err) {
    console.error('[POST /api/chat/room] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/chat/room?userId=xxx
 * - 유저(기기)별 채팅방 목록
 */
router.get('/room', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, error: 'MISSING_USER' });

    const [rows] = await pool.query<ChatRoomRow[]>(
      `
      SELECT id, title, created_at
      FROM chat_room
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 200
      `,
      [userId],
    );

    const items: RoomItem[] = rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      createdAt: r.created_at.toISOString(),
    }));

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[GET /api/chat/room] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/chat
 * body: { userId, roomId, message }
 * - room 소유 검증 후 Redis에 user/assistant 메시지 저장
 * - LLM 히스토리도 Redis에서 읽음
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, error: 'MISSING_USER' });

    const roomIdNum = Number(req.body?.roomId);
    const msg = String(req.body?.message ?? '').trim();

    if (!roomIdNum || Number.isNaN(roomIdNum)) {
      return res.status(400).json({ ok: false, error: 'MISSING_ROOM_ID' });
    }
    if (!msg) {
      return res.status(400).json({ ok: false, error: 'MISSING_MESSAGE' });
    }

    // 0) 방 소유 검증
    await assertRoomOwner(roomIdNum, userId);

    // 1) LLM용 히스토리: Redis에서 최근 N개
    const historyItems = await getChatHistory(roomIdNum, 20);
    const history = historyItems.map((x) => ({ role: x.role, content: x.content }));

    // 2) user 메시지 Redis 저장
    await pushChat(roomIdNum, 'user', msg);

    // 3) LLM 호출
    const replyText = await callLLM(history, msg);

    // 4) assistant 메시지 Redis 저장
    await pushChat(roomIdNum, 'assistant', replyText);

    return res.json({
      ok: true,
      assistant: {
        roomId: roomIdNum,
        role: 'assistant' as ChatRole,
        content: replyText,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[POST /api/chat] error:', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const msg = typeof err?.message === 'string' ? err.message : 'INTERNAL_ERROR';
    return res.status(status).json({ ok: false, error: msg });
  }
});

/**
 * GET /api/chat/log?userId=xxx&roomId=12&limit=50
 * - Redis에서 해당 방 채팅 로그 반환
 */
router.get('/log', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, error: 'MISSING_USER' });

    const roomId = Number(req.query.roomId);
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    if (!roomId || Number.isNaN(roomId)) {
      return res.status(400).json({ ok: false, error: 'MISSING_ROOM_ID' });
    }

    // 방 소유 검증
    await assertRoomOwner(roomId, userId);

    const items = await getChatLog(roomId, limit);

    return res.json({
      ok: true,
      items: items.map((x) => ({
        roomId,
        role: x.role,
        content: x.content,
        createdAt: new Date(x.ts).toISOString(),
      })),
    });
  } catch (err: any) {
    console.error('[GET /api/chat/log] error:', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const msg = typeof err?.message === 'string' ? err.message : 'INTERNAL_ERROR';
    return res.status(status).json({ ok: false, error: msg });
  }
});

export default router;
