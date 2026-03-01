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
  ts: number; // Redis 캐시용(ms)
};

// ✅ DB에 user_id 컬럼이 추가된 버전 기준
type DbChatRow = RowDataPacket & {
  id: number;
  user_id: string;
  room_id: number;
  role: ChatRole;
  content: string;
  created_at: Date;
};

/* =====================
 * OpenAI
 * ===================== */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

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
 * Redis: 메시지 저장/조회 (최근 캐시용)
 * ===================== */

const CHAT_LIST_LIMIT = Number(process.env.CHAT_LIST_LIMIT ?? 50); // 방당 최근 50개 유지
const CHAT_TTL_SEC = Number(process.env.CHAT_TTL_SEC ?? 60 * 60 * 24 * 7); // 기본 7일

function chatKey(roomId: number) {
  return `chat:${roomId}`;
}

async function pushChat(roomId: number, role: ChatRole, content: string, ts?: number) {
  const redis = await getRedis();
  const key = chatKey(roomId);

  const payload: ChatItem = {
    role,
    content,
    ts: typeof ts === 'number' ? ts : Date.now(),
  };

  await redis.lPush(key, JSON.stringify(payload));
  await redis.lTrim(key, 0, CHAT_LIST_LIMIT - 1);
  await redis.expire(key, CHAT_TTL_SEC);
}

async function getChatLogRedis(roomId: number, limit = 50): Promise<ChatItem[]> {
  const redis = await getRedis();
  const key = chatKey(roomId);

  const raw = await redis.lRange(key, 0, Math.max(0, Math.min(limit, 200) - 1));
  const items: ChatItem[] = [];

  for (const s of raw) {
    try {
      const obj = JSON.parse(s) as ChatItem;
      if (
        obj &&
        (obj.role === 'user' || obj.role === 'assistant') &&
        typeof obj.content === 'string' &&
        typeof obj.ts === 'number'
      ) {
        items.push(obj);
      }
    } catch {
      // ignore
    }
  }

  // 최신→과거(LPUSH)라 reverse해서 오래된→최신
  return items.reverse();
}

/* =====================
 * DB: 메시지 저장/조회 (Source of Truth)
 * ✅ user_id + created_at 기반 조회 지원
 * ===================== */

async function persistChatToDb(params: {
  userId: string;
  roomId: number;
  role: ChatRole;
  content: string;
  createdAt: Date;
}): Promise<number> {
  const { userId, roomId, role, content, createdAt } = params;

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO chat_message (user_id, room_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, roomId, role, content, createdAt],
  );

  return result.insertId;
}

async function getChatRecentFromDb(params: { userId: string; roomId: number; limit: number }): Promise<DbChatRow[]> {
  const { userId, roomId, limit } = params;
  const lim = Math.min(Math.max(limit, 1), 500);

  const [rows] = await pool.query<DbChatRow[]>(
    `
    SELECT id, user_id, room_id, role, content, created_at
    FROM chat_message
    WHERE user_id = ? AND room_id = ?
    ORDER BY id DESC
    LIMIT ?
    `,
    [userId, roomId, lim],
  );
  return rows;
}

/**
 * ✅ 회고/기간조회: room_id 없이 user_id + created_at 로 "전체 방"을 검색
 */
async function getChatByDateRangeByUser(params: {
  userId: string;
  from: Date;
  to: Date;
  limit: number;
}): Promise<DbChatRow[]> {
  const { userId, from, to, limit } = params;
  const lim = Math.min(Math.max(limit, 1), 2000);

  const [rows] = await pool.query<DbChatRow[]>(
    `
    SELECT id, user_id, room_id, role, content, created_at
    FROM chat_message
    WHERE user_id = ?
      AND created_at >= ?
      AND created_at <= ?
    ORDER BY id DESC
    LIMIT ?
    `,
    [userId, from, to, lim],
  );
  return rows;
}

/**
 * ✅ 룸 로그(페이지네이션): room_id 기준은 유지하되 user_id도 같이 체크
 */
async function getChatLogFromDbCursor(params: {
  userId: string;
  roomId: number;
  limit: number;
  beforeId?: number;
}): Promise<DbChatRow[]> {
  const { userId, roomId, limit, beforeId } = params;
  const lim = Math.min(Math.max(limit, 1), 200);

  if (beforeId && !Number.isNaN(beforeId)) {
    const [rows] = await pool.query<DbChatRow[]>(
      `
      SELECT id, user_id, room_id, role, content, created_at
      FROM chat_message
      WHERE user_id = ? AND room_id = ? AND id < ?
      ORDER BY id DESC
      LIMIT ?
      `,
      [userId, roomId, beforeId, lim],
    );
    return rows;
  }

  const [rows] = await pool.query<DbChatRow[]>(
    `
    SELECT id, user_id, room_id, role, content, created_at
    FROM chat_message
    WHERE user_id = ? AND room_id = ?
    ORDER BY id DESC
    LIMIT ?
    `,
    [userId, roomId, lim],
  );
  return rows;
}

/* =====================
 * “회고 질문” 감지 + 기간 파싱
 * ===================== */

function isRecallQuery(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  const keywords = [
    '지난',
    '저번',
    '그때',
    '기억',
    '기록',
    '회고',
    '요약',
    '언제',
    '어땠',
    '뭐했',
    '무엇했',
    '했었',
    '했었지',
    '주 전',
    '주전',
    '달 전',
    '달전',
    '년 전',
    '년전',
    '어제',
    '오늘',
    '그제',
    '엊그제',
    '작년',
    '재작년',
  ];

  if (keywords.some((k) => t.includes(k))) return true;
  if (/\d+\s*(일|주|개월|달|년)\b/.test(t)) return true;
  if (/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(t)) return true;

  return false;
}

function parseDateToken(token: string): Date | null {
  const m = token.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function clampRange(from: Date, to: Date) {
  if (from.getTime() > to.getTime()) return { from: to, to: from };
  return { from, to };
}

function extractRangeFromMessage(message?: string): { from: Date; to: Date; label: string } | null {
  const now = new Date();
  const text = (message ?? '').trim();
  if (!text) return null;

  const dateTokens: string[] = text.match(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g) ?? [];

  if (dateTokens.length >= 2) {
    const t0 = dateTokens[0];
    const t1 = dateTokens[1];

    const d1 = parseDateToken(t0);
    const d2 = parseDateToken(t1);

    if (d1 && d2) {
      const a = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate(), 0, 0, 0, 0);
      const b = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate(), 23, 59, 59, 999);
      const r = clampRange(a, b);
      return { ...r, label: `${t0}~${t1}` };
    }
  }

  if (dateTokens.length === 1) {
    const t0 = dateTokens[0];
    const d = parseDateToken(t0);
    if (d) {
      const from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      return { from, to, label: `${t0}(하루)` };
    }
  }

  const dayMs = 24 * 60 * 60 * 1000;

  if (text.includes('오늘')) {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from, to, label: '오늘' };
  }
  if (text.includes('어제')) {
    const base = new Date(now.getTime() - dayMs);
    const from = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
    const to = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
    return { from, to, label: '어제' };
  }
  if (text.includes('지난주') || text.includes('저번주')) {
    const from = new Date(now.getTime() - 7 * dayMs);
    return { from, to: now, label: '지난 7일' };
  }
  if (text.includes('지난달') || text.includes('저번달')) {
    const from = new Date(now.getTime() - 30 * dayMs);
    return { from, to: now, label: '지난 30일' };
  }
  if (text.includes('작년')) {
    const from = new Date(now.getTime() - 365 * dayMs);
    return { from, to: now, label: '지난 1년(작년 언급)' };
  }

  const m = text.match(/(\d+)\s*(일|주|개월|달|년)\b/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2] as '일' | '주' | '개월' | '달' | '년';

    if (n > 0) {
      let days = 0;
      if (unit === '일') days = n;
      if (unit === '주') days = n * 7;
      if (unit === '달' || unit === '개월') days = n * 30;
      if (unit === '년') days = n * 365;

      const from = new Date(now.getTime() - days * dayMs);
      return { from, to: now, label: `최근 ${n}${unit}` };
    }
  }

  return null;
}

/* =====================
 * LLM 프롬프트 구성 (DB 근거 우선)
 * ===================== */

function formatDbRowsForPrompt(rowsAsc: DbChatRow[]): string {
  const cut = (s: string, max = 500) => (s.length > max ? s.slice(0, max) + '…' : s);

  return rowsAsc
    .map((r) => {
      const ts = r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at);
      const who = r.role === 'user' ? '사용자' : 'AI';
      return `[${ts}] ${who}: ${cut(r.content)}`;
    })
    .join('\n');
}

async function callLLMWithDbContext(params: {
  recentContext: DbChatRow[];
  recallContext: DbChatRow[];
  userMessage: string;
  recallLabel?: string;
}): Promise<string> {
  if (!OPENAI_API_KEY) return 'OpenAI API 키가 설정되어 있지 않습니다.';

  const { recentContext, recallContext, userMessage, recallLabel } = params;

  const recentText = recentContext.length ? formatDbRowsForPrompt(recentContext) : '';
  const recallText = recallContext.length ? formatDbRowsForPrompt(recallContext) : '';

  const prompt = `
너는 사용자의 일상/일정/운동/고민을 돕는 한국어 비서야.
반드시 아래 “DB 기록”을 근거로 답해. 기록이 부족하면 추측하지 말고 "기록에서 확인되지 않는다"라고 말해.

[DB 기록 - 최근 대화(맥락)]
${recentText || '(최근 대화 기록 없음)'}

${recallLabel ? `[DB 기록 - 회고 구간: ${recallLabel}]` : '[DB 기록 - 회고 구간]'}
${recallText || '(해당 기간 기록 없음)'}

[사용자 질문]
${userMessage}

[답변 가이드]
- 사용자가 "n주 전/1년 전/지난달" 같이 과거를 묻는 경우, 회고 구간 기록을 우선으로 요약/정리해 답해.
- 가능한 경우, 날짜/활동을 항목으로 정리해.
- 기록이 없다면, "그 기간의 기록이 없어 확인할 수 없다"라고 말해.
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
 * Router
 * ===================== */

const router = Router();

router.post('/anon', (_req: Request, res: Response) => {
  const userId = 'anon_' + crypto.randomBytes(16).toString('hex');
  return res.json({ ok: true, userId });
});

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
    //db가 어디붙어있는지 좀 보려고 추가했어요~
    const [rows] = await pool.query("SELECT DATABASE()");
    console.log("현재 DB:", rows);
    const [tables] = await pool.query("SHOW TABLES");
    console.log("테이블 목록:", tables);
    const [rows2] = await pool.query("SELECT @@hostname, @@port");
    console.log("DB 서버 정보:", rows2);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

/**
 * ✅ 핵심: DB 저장을 "반드시" 수행
 * ✅ 회고(기간조회)는 user_id + created_at 으로 "전체 방"에서 검색
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

    await assertRoomOwner(roomIdNum, userId);

    // 1) user 저장: Redis + DB(강제)
    const userTs = Date.now();
    const userCreatedAt = new Date(userTs);

    await pushChat(roomIdNum, 'user', msg, userTs);

    const userInsertId = await persistChatToDb({
      userId,
      roomId: roomIdNum,
      role: 'user',
      content: msg,
      createdAt: userCreatedAt,
    });

    // 2) LLM 컨텍스트는 DB에서 항상 조회
    const RECENT_DB_CONTEXT = Number(process.env.RECENT_DB_CONTEXT ?? 40);
    const RECALL_DB_LIMIT = Number(process.env.RECALL_DB_LIMIT ?? 400);

    // ✅ 최근맥락은 "현재 방" 기준 (대화 흐름 유지용)
    const recentRowsDesc = await getChatRecentFromDb({
      userId,
      roomId: roomIdNum,
      limit: RECENT_DB_CONTEXT,
    });
    const recentRowsAsc = recentRowsDesc.slice().reverse();

    let recallRowsAsc: DbChatRow[] = [];
    let recallLabel: string | undefined;

    // ✅ 회고는 "유저 전체 메시지"에서 기간으로 검색
    if (isRecallQuery(msg)) {
      const range = extractRangeFromMessage(msg);
      const now = new Date();

      if (range) {
        recallLabel = range.label;
        const recallDesc = await getChatByDateRangeByUser({
          userId,
          from: range.from,
          to: range.to,
          limit: RECALL_DB_LIMIT,
        });
        recallRowsAsc = recallDesc.slice().reverse();
      } else {
        const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        recallLabel = '최근 90일(기간 추정)';
        const recallDesc = await getChatByDateRangeByUser({
          userId,
          from,
          to: now,
          limit: RECALL_DB_LIMIT,
        });
        recallRowsAsc = recallDesc.slice().reverse();
      }
    }

    // 3) LLM 호출
    const replyText = await callLLMWithDbContext({
      recentContext: recentRowsAsc,
      recallContext: recallRowsAsc,
      userMessage: msg,
      recallLabel,
    });

    // 4) assistant 저장: Redis + DB(강제)
    const aiTs = Date.now();
    const aiCreatedAt = new Date(aiTs);

    await pushChat(roomIdNum, 'assistant', replyText, aiTs);

    const aiInsertId = await persistChatToDb({
      userId,
      roomId: roomIdNum,
      role: 'assistant',
      content: replyText,
      createdAt: aiCreatedAt,
    });

    return res.json({
      ok: true,
      debug: { userInsertId, aiInsertId }, // 원하면 나중에 제거
      assistant: {
        roomId: roomIdNum,
        role: 'assistant' as ChatRole,
        content: replyText,
        createdAt: aiCreatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[POST /api/chat] error:', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const msg = typeof err?.message === 'string' ? err.message : 'INTERNAL_ERROR';
    return res.status(status).json({ ok: false, error: msg });
  }
});

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

router.get('/log', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, error: 'MISSING_USER' });

    const roomId = Number(req.query.roomId);
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    if (!roomId || Number.isNaN(roomId)) {
      return res.status(400).json({ ok: false, error: 'MISSING_ROOM_ID' });
    }

    await assertRoomOwner(roomId, userId);

    const redisItems = await getChatLogRedis(roomId, limit);
    if (redisItems.length > 0) {
      return res.json({
        ok: true,
        source: 'redis',
        items: redisItems.map((x) => ({
          roomId,
          role: x.role,
          content: x.content,
          createdAt: new Date(x.ts).toISOString(),
        })),
      });
    }

    // ✅ DB 조회도 user_id 조건 포함
    const rowsDesc = await getChatRecentFromDb({ userId, roomId, limit });
    const rowsAsc = rowsDesc.slice().reverse();

    return res.json({
      ok: true,
      source: 'db',
      items: rowsAsc.map((r) => ({
        id: r.id,
        roomId: r.room_id,
        role: r.role,
        content: r.content,
        createdAt: r.created_at.toISOString(),
      })),
      nextBeforeId: rowsDesc.length ? rowsDesc[rowsDesc.length - 1].id : null,
    });
  } catch (err: any) {
    console.error('[GET /api/chat/log] error:', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const msg = typeof err?.message === 'string' ? err.message : 'INTERNAL_ERROR';
    return res.status(status).json({ ok: false, error: msg });
  }
});

router.get('/log/db', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, error: 'MISSING_USER' });

    const roomId = Number(req.query.roomId);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const beforeId = req.query.beforeId ? Number(req.query.beforeId) : undefined;

    if (!roomId || Number.isNaN(roomId)) {
      return res.status(400).json({ ok: false, error: 'MISSING_ROOM_ID' });
    }

    await assertRoomOwner(roomId, userId);

    const rowsDesc = await getChatLogFromDbCursor({ userId, roomId, limit, beforeId });
    const rowsAsc = rowsDesc.slice().reverse();
    const nextBeforeId = rowsDesc.length ? rowsDesc[rowsDesc.length - 1].id : null;

    return res.json({
      ok: true,
      items: rowsAsc.map((r) => ({
        id: r.id,
        roomId: r.room_id,
        role: r.role,
        content: r.content,
        createdAt: r.created_at.toISOString(),
      })),
      nextBeforeId,
    });
  } catch (err: any) {
    console.error('[GET /api/chat/log/db] error:', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const msg = typeof err?.message === 'string' ? err?.message : 'INTERNAL_ERROR';
    return res.status(status).json({ ok: false, error: msg });
  }
});

export default router;
