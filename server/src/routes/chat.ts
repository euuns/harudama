import { Router, Request, Response } from 'express';
import 'dotenv/config';
import OpenAI from 'openai';
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

type MemoryItem = {
  roomId: number;
  content: string;
  ts: number;
};

type DbChatRow = RowDataPacket & {
  id: number;
  user_id: string;
  room_id: number;
  role: ChatRole;
  content: string;
  created_at: Date;
};

type PromptRow = {
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
 * 상수
 * ===================== */

const ROOM_CHAT_LIMIT = Number(process.env.ROOM_CHAT_LIMIT ?? 100);
const ROOM_CHAT_TTL_SEC = Number(process.env.ROOM_CHAT_TTL_SEC ?? 60 * 60 * 24 * 7);

const MEMORY_LIST_LIMIT = Number(process.env.MEMORY_LIST_LIMIT ?? 300);
const MEMORY_TTL_SEC = Number(process.env.MEMORY_TTL_SEC ?? 60 * 60 * 24 * 7);

const CURRENT_ROOM_CONTEXT = Number(process.env.CURRENT_ROOM_CONTEXT ?? 20);
const CROSS_ROOM_MEMORY_DAYS = Number(process.env.CROSS_ROOM_MEMORY_DAYS ?? 7);
const CROSS_ROOM_MEMORY_LIMIT = Number(process.env.CROSS_ROOM_MEMORY_LIMIT ?? 80);
const RECALL_DB_LIMIT = Number(process.env.RECALL_DB_LIMIT ?? 400);

/* =====================
 * 유틸
 * ===================== */

function getUserId(req: Request): string | null {
  const userId = (req.body?.user_id ?? req.query?.user_id) as string | undefined;
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

function toIsoStringSafe(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function nowKoTitle(): string {
  return new Date().toLocaleString('ko-KR', { hour12: false });
}

function getCutoffMs(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function getMemoReply(): string {
  const replies = ['메모했어.', '기록해둘게.', '기억해둘게.', '남겨둘게.'];
  return replies[Math.floor(Math.random() * replies.length)];
}

/* =====================
 * 질문/메모 분류
 * ===================== */

/**
 * 과거 행동/기록 조회 질문
 */
function isMemoryQuery(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  const patterns = [
    '뭐했',
    '뭐 했',
    '뭐했어',
    '뭐 했어',
    '오늘 뭐',
    '어제 뭐',
    '최근 뭐',
    '내가 뭐',
    '나 뭐',
    '기억나',
    '기억해',
    '기록',
    '요약',
    '정리해',
    '무슨 일',
    '했었',
    '했었지',
    '어땠',
    '언제',
    '지난',
    '저번',
    '주 전',
    '주전',
    '달 전',
    '달전',
    '년 전',
    '년전',
  ];

  if (patterns.some((p) => t.includes(p))) return true;
  if (/\d+\s*(일|주|개월|달|년)\b/.test(t)) return true;
  if (/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(t)) return true;

  return false;
}

/**
 * 일반 질문
 */
function isGeneralQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  if (isMemoryQuery(t)) return false;

  return (
    t.includes('?') ||
    t.includes('왜') ||
    t.includes('어떻게') ||
    t.includes('뭐야') ||
    t.includes('뭔데') ||
    t.includes('뭔지') ||
    t.includes('차이') ||
    t.includes('설명') ||
    t.includes('알려줘') ||
    t.includes('가능해') ||
    t.includes('해줘') ||
    t.includes('맞아') ||
    t.includes('맞지') ||
    t.includes('추천') ||
    t.includes('방법')
  );
}

/**
 * 회고/기억 데이터에서 제외할 질문형 문장
 */
function isQuestionLikeText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  return (
    t.includes('?') ||
    t.includes('왜') ||
    t.includes('어떻게') ||
    t.includes('뭐야') ||
    t.includes('뭔데') ||
    t.includes('뭔지') ||
    t.includes('설명') ||
    t.includes('알려줘') ||
    t.includes('가능해') ||
    t.includes('해줘') ||
    t.includes('차이') ||
    t.includes('추천') ||
    t.includes('방법')
  );
}

/**
 * 메모 후보 문장
 */
function isMemoCandidate(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isMemoryQuery(t)) return false;
  if (isGeneralQuestion(t)) return false;
  return true;
}

/* =====================
 * Redis 키
 * ===================== */

function roomChatKey(userId: string, roomId: number) {
  return `chat:room:${userId}:${roomId}`;
}

function userMemoryKey(userId: string) {
  return `chat:memory:${userId}`;
}

/* =====================
 * Redis: 방 로그 저장/조회
 * ===================== */

async function pushRoomChat(
  userId: string,
  roomId: number,
  role: ChatRole,
  content: string,
  ts?: number,
): Promise<void> {
  const redis = await getRedis();
  const key = roomChatKey(userId, roomId);

  const payload: ChatItem = {
    role,
    content,
    ts: typeof ts === 'number' ? ts : Date.now(),
  };

  await redis.lPush(key, JSON.stringify(payload));
  await redis.lTrim(key, 0, ROOM_CHAT_LIMIT - 1);
  await redis.expire(key, ROOM_CHAT_TTL_SEC);
}

async function getRoomChatRedis(userId: string, roomId: number, limit = 50): Promise<ChatItem[]> {
  const redis = await getRedis();
  const key = roomChatKey(userId, roomId);

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

  return items.reverse();
}

/* =====================
 * Redis: 유저 기억 저장/조회
 * 메모성 사용자 문장만 저장
 * ===================== */

async function pushUserMemory(userId: string, roomId: number, content: string, ts?: number): Promise<void> {
  const redis = await getRedis();
  const key = userMemoryKey(userId);

  const payload: MemoryItem = {
    roomId,
    content,
    ts: typeof ts === 'number' ? ts : Date.now(),
  };

  await redis.lPush(key, JSON.stringify(payload));
  await redis.lTrim(key, 0, MEMORY_LIST_LIMIT - 1);
  await redis.expire(key, MEMORY_TTL_SEC);
}

async function getUserMemoryRedis(userId: string, days = 7, limit = 100): Promise<MemoryItem[]> {
  const redis = await getRedis();
  const key = userMemoryKey(userId);

  const raw = await redis.lRange(key, 0, MEMORY_LIST_LIMIT - 1);
  const items: MemoryItem[] = [];
  const cutoff = getCutoffMs(days);

  for (const s of raw) {
    try {
      const obj = JSON.parse(s) as MemoryItem;
      if (
        obj &&
        typeof obj.roomId === 'number' &&
        typeof obj.content === 'string' &&
        typeof obj.ts === 'number' &&
        obj.ts >= cutoff
      ) {
        items.push(obj);
      }
    } catch {
      // ignore
    }
  }

  return items.reverse().slice(-Math.min(Math.max(limit, 1), 500));
}

/* =====================
 * DB: 저장/조회
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
    `
    INSERT INTO chat_message (user_id, room_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
    `,
    [userId, roomId, role, content, createdAt],
  );

  return result.insertId;
}

async function getChatRecentFromDb(params: {
  userId: string;
  roomId: number;
  limit: number;
}): Promise<DbChatRow[]> {
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

async function getUserWideRecentContextFromDb(params: {
  userId: string;
  days: number;
  limit: number;
  currentRoomId?: number;
}): Promise<DbChatRow[]> {
  const { userId, days, limit, currentRoomId } = params;
  const lim = Math.min(Math.max(limit, 1), 1000);
  const from = new Date(getCutoffMs(days));

  if (currentRoomId) {
    const [rows] = await pool.query<DbChatRow[]>(
      `
      SELECT id, user_id, room_id, role, content, created_at
      FROM chat_message
      WHERE user_id = ?
        AND created_at >= ?
        AND room_id <> ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
      `,
      [userId, from, currentRoomId, lim],
    );
    return rows;
  }

  const [rows] = await pool.query<DbChatRow[]>(
    `
    SELECT id, user_id, room_id, role, content, created_at
    FROM chat_message
    WHERE user_id = ?
      AND created_at >= ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
    `,
    [userId, from, lim],
  );

  return rows;
}

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

/* =====================
 * 기간 파싱
 * ===================== */

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
 * 프롬프트용 변환
 * ===================== */

function dbRowsToPromptRows(rows: DbChatRow[]): PromptRow[] {
  return rows.map((r) => ({
    room_id: r.room_id,
    role: r.role,
    content: r.content,
    created_at: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));
}

function roomChatItemsToPromptRows(roomId: number, rows: ChatItem[]): PromptRow[] {
  return rows.map((r) => ({
    room_id: roomId,
    role: r.role,
    content: r.content,
    created_at: new Date(r.ts),
  }));
}

function memoryItemsToPromptRows(rows: MemoryItem[]): PromptRow[] {
  return rows.map((r) => ({
    room_id: r.roomId,
    role: 'user',
    content: r.content,
    created_at: new Date(r.ts),
  }));
}

function sortPromptRowsAsc(rows: PromptRow[]): PromptRow[] {
  return rows
    .slice()
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
}

function formatPromptRows(rowsAsc: PromptRow[]): string {
  const cut = (s: string, max = 500) => (s.length > max ? s.slice(0, max) + '…' : s);

  return rowsAsc
    .map((r) => {
      const who = r.role === 'user' ? '사용자' : 'AI';
      return `[room:${r.room_id}] [${toIsoStringSafe(r.created_at)}] ${who}: ${cut(r.content)}`;
    })
    .join('\n');
}

function filterMemoryFactRows(rows: PromptRow[], excludeContent?: string): PromptRow[] {
  return rows.filter((row) => {
    if (row.role !== 'user') return false;
    if (!row.content?.trim()) return false;
    if (excludeContent && row.content.trim() === excludeContent.trim()) return false;
    if (isQuestionLikeText(row.content)) return false;
    return true;
  });
}

/* =====================
 * 컨텍스트 구성
 * ===================== */

async function buildCurrentRoomContext(userId: string, roomId: number, limit: number): Promise<PromptRow[]> {
  const redisItems = await getRoomChatRedis(userId, roomId, limit);
  if (redisItems.length > 0) {
    return sortPromptRowsAsc(roomChatItemsToPromptRows(roomId, redisItems));
  }

  const dbRowsDesc = await getChatRecentFromDb({ userId, roomId, limit });
  return sortPromptRowsAsc(dbRowsToPromptRows(dbRowsDesc));
}

async function buildCrossRoomMemoryContext(
  userId: string,
  currentRoomId: number,
  days: number,
  limit: number,
): Promise<PromptRow[]> {
  const redisMemory = await getUserMemoryRedis(userId, days, limit);
  const redisRows = memoryItemsToPromptRows(redisMemory).filter((r) => r.room_id !== currentRoomId);

  const dbRowsDesc = await getUserWideRecentContextFromDb({
    userId,
    days,
    limit: Math.max(limit * 2, 100),
    currentRoomId,
  });

  const dbRows = dbRowsToPromptRows(dbRowsDesc);

  const merged = [...dbRows, ...redisRows];
  const filtered = filterMemoryFactRows(merged);

  const uniqueMap = new Map<string, PromptRow>();
  for (const row of filtered) {
    const key = `${row.room_id}|${row.content}|${row.created_at.getTime()}`;
    uniqueMap.set(key, row);
  }

  return sortPromptRowsAsc(Array.from(uniqueMap.values())).slice(-limit);
}

async function buildRecallContext(userId: string, userMessage: string): Promise<{
  rows: PromptRow[];
  label?: string;
}> {
  const range = extractRangeFromMessage(userMessage);
  const now = new Date();

  if (range) {
    const rowsDesc = await getChatByDateRangeByUser({
      userId,
      from: range.from,
      to: range.to,
      limit: RECALL_DB_LIMIT,
    });

    const rowsAsc = sortPromptRowsAsc(filterMemoryFactRows(dbRowsToPromptRows(rowsDesc), userMessage));
    return {
      rows: rowsAsc,
      label: range.label,
    };
  }

  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const rowsDesc = await getChatByDateRangeByUser({
    userId,
    from,
    to: now,
    limit: RECALL_DB_LIMIT,
  });

  const rowsAsc = sortPromptRowsAsc(filterMemoryFactRows(dbRowsToPromptRows(rowsDesc), userMessage));
  return {
    rows: rowsAsc,
    label: '최근 90일(기간 추정)',
  };
}

/* =====================
 * LLM
 * ===================== */

async function callGeneralLLM(params: {
  currentRoomContext: PromptRow[];
  userMessage: string;
}): Promise<string> {
  if (!OPENAI_API_KEY) return 'OpenAI API 키가 설정되어 있지 않습니다.';

  const { currentRoomContext, userMessage } = params;
  const currentRoomText = currentRoomContext.length
    ? formatPromptRows(currentRoomContext)
    : '(현재 방 최근 대화 없음)';

  const prompt = `
너는 한국어로 답하는 친근한 비서다.
사용자의 일반 질문에 자연스럽고 간결하게 답해.

규칙:
- 불필요하게 길게 쓰지 마
- 내부 저장 구조, DB, Redis, 로그 같은 표현 금지
- 질문에 바로 답해
- 현재 방 최근 대화가 도움이 되면 참고하되, 없으면 질문 자체에 집중해 답해

[현재 방 최근 대화]
${currentRoomText}

[사용자 질문]
${userMessage}
`.trim();

  const response = await openai.responses.create({
    model: 'gpt-5-mini',
    input: prompt,
    max_output_tokens: 1024,
  });

  const text = (response as any).output_text as string | undefined;
  return (text ?? '').trim();
}

async function callMemoryLLM(params: {
  currentRoomFacts: PromptRow[];
  crossRoomMemory: PromptRow[];
  recallContext: PromptRow[];
  userMessage: string;
  recallLabel?: string;
}): Promise<string> {
  if (!OPENAI_API_KEY) return 'OpenAI API 키가 설정되어 있지 않습니다.';

  const { currentRoomFacts, crossRoomMemory, recallContext, userMessage, recallLabel } = params;

  const currentRoomText = currentRoomFacts.length
    ? formatPromptRows(currentRoomFacts)
    : '(현재 방에서 참고할 사용자 기록 없음)';

  const crossRoomText = crossRoomMemory.length
    ? formatPromptRows(crossRoomMemory)
    : '(최근 7일 전체 기억 없음)';

  const recallText = recallContext.length
    ? formatPromptRows(recallContext)
    : '(해당 기간 기록 없음)';

  const prompt = `
너는 사용자가 예전에 했던 행동/상태/감정을 기억해서 짧게 알려주는 한국어 비서다.

중요 규칙:
- 사용자가 "내가 뭐했어?"처럼 물었을 때만 답한다
- 사용자가 예전에 했던 "질문"은 회고에 포함하지 마
- 행동, 감정, 상태, 했던 일만 요약해
- 저장 여부, 기록 여부, 메모 여부, DB, Redis, 로그 같은 말 금지
- 항목 보고서처럼 길게 쓰지 마
- 자연스럽고 짧게 2~5문장 정도로 답해
- 없으면 "딱히 떠오르는 건 많지 않은데" 정도로 자연스럽게 말해
- 없는 내용을 지어내지 마

[현재 방 사용자 기록]
${currentRoomText}

[최근 7일 전체 기억]
${crossRoomText}

${recallLabel ? `[참고 구간: ${recallLabel}]` : '[참고 구간]'}
${recallText}

[사용자 질문]
${userMessage}
`.trim();

  const response = await openai.responses.create({
    model: 'gpt-5-mini',
    input: prompt,
    max_output_tokens: 1024,
  });

  const text = (response as any).output_text as string | undefined;
  return (text ?? '').trim();
}

/* =====================
 * Router
 * ===================== */

const router = Router();

/**
 * 방 생성
 * body: { user_id, title? }
 */
router.post('/room', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'MISSING_USER_ID' });
    }

    const title = (req.body?.title as string | undefined)?.trim() || nowKoTitle();
    const now = new Date();

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO chat_room (user_id, title, created_at) VALUES (?, ?, ?)`,
      [userId, title, now],
    );

    return res.json({
      ok: true,
      room: {
        id: result.insertId,
        user_id: userId,
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
 * 채팅 전송
 * body: { user_id, roomId, message }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'MISSING_USER_ID' });
    }

    const roomIdNum = Number(req.body?.roomId);
    const msg = String(req.body?.message ?? '').trim();

    if (!roomIdNum || Number.isNaN(roomIdNum)) {
      return res.status(400).json({ ok: false, error: 'MISSING_ROOM_ID' });
    }

    if (!msg) {
      return res.status(400).json({ ok: false, error: 'MISSING_MESSAGE' });
    }

    await assertRoomOwner(roomIdNum, userId);

    /* 1) 사용자 메시지 저장: room redis + db */
    const userTs = Date.now();
    const userCreatedAt = new Date(userTs);

    await pushRoomChat(userId, roomIdNum, 'user', msg, userTs);

    const userInsertId = await persistChatToDb({
      userId,
      roomId: roomIdNum,
      role: 'user',
      content: msg,
      createdAt: userCreatedAt,
    });

    /* 2) 메시지 분류 */
    const memoryQuery = isMemoryQuery(msg);
    const generalQuestion = !memoryQuery && isGeneralQuestion(msg);
    const memoCandidate = !memoryQuery && !generalQuestion && isMemoCandidate(msg);

    let replyText = '';
    let currentRoomContextCount = 0;
    let crossRoomMemoryCount = 0;
    let recallCount = 0;
    let mode: 'memo' | 'memory_query' | 'general' = 'memo';

    /* 3) 메모형 */
    if (memoCandidate) {
      mode = 'memo';

      // 메모성 문장만 유저 기억 Redis에 저장
      await pushUserMemory(userId, roomIdNum, msg, userTs);

      replyText = getMemoReply();
    } else if (memoryQuery) {
      /* 4) 기억 조회형 */
      mode = 'memory_query';

      const currentRoomContext = await buildCurrentRoomContext(userId, roomIdNum, CURRENT_ROOM_CONTEXT);
      const currentRoomFacts = filterMemoryFactRows(currentRoomContext, msg);
      currentRoomContextCount = currentRoomFacts.length;

      const crossRoomMemory = await buildCrossRoomMemoryContext(
        userId,
        roomIdNum,
        CROSS_ROOM_MEMORY_DAYS,
        CROSS_ROOM_MEMORY_LIMIT,
      );
      crossRoomMemoryCount = crossRoomMemory.length;

      const recallResult = await buildRecallContext(userId, msg);
      const recallContext = recallResult.rows;
      recallCount = recallContext.length;

      replyText = await callMemoryLLM({
        currentRoomFacts,
        crossRoomMemory,
        recallContext,
        userMessage: msg,
        recallLabel: recallResult.label,
      });
    } else {
      /* 5) 일반 질문형 */
      mode = 'general';

      const currentRoomContext = await buildCurrentRoomContext(userId, roomIdNum, CURRENT_ROOM_CONTEXT);
      currentRoomContextCount = currentRoomContext.length;

      replyText = await callGeneralLLM({
        currentRoomContext,
        userMessage: msg,
      });
    }

    /* 6) AI 응답 저장: room redis + db */
    const aiTs = Date.now();
    const aiCreatedAt = new Date(aiTs);

    await pushRoomChat(userId, roomIdNum, 'assistant', replyText, aiTs);

    const aiInsertId = await persistChatToDb({
      userId,
      roomId: roomIdNum,
      role: 'assistant',
      content: replyText,
      createdAt: aiCreatedAt,
    });

    return res.json({
      ok: true,
      debug: {
        mode,
        userInsertId,
        aiInsertId,
        currentRoomContextCount,
        crossRoomMemoryCount,
        recallCount,
      },
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

/**
 * 방 목록 조회
 * query: ?user_id=xxx
 */
router.get('/room', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'MISSING_USER_ID' });
    }

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
      createdAt: toIsoStringSafe(r.created_at),
    }));

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[GET /api/chat/room] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

/**
 * 최근 로그 조회
 * query: ?user_id=xxx&roomId=1&limit=50
 * Redis 우선, 없으면 DB
 */
router.get('/log', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'MISSING_USER_ID' });
    }

    const roomId = Number(req.query.roomId);
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    if (!roomId || Number.isNaN(roomId)) {
      return res.status(400).json({ ok: false, error: 'MISSING_ROOM_ID' });
    }

    await assertRoomOwner(roomId, userId);

    const redisItems = await getRoomChatRedis(userId, roomId, limit);
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
        createdAt: toIsoStringSafe(r.created_at),
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

/**
 * DB 로그 페이지네이션 조회
 * query: ?user_id=xxx&roomId=1&limit=50&beforeId=123
 */
router.get('/log/db', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'MISSING_USER_ID' });
    }

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
        createdAt: toIsoStringSafe(r.created_at),
      })),
      nextBeforeId,
    });
  } catch (err: any) {
    console.error('[GET /api/chat/log/db] error:', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const msg = typeof err?.message === 'string' ? err.message : 'INTERNAL_ERROR';
    return res.status(status).json({ ok: false, error: msg });
  }
});

/**
 * 최근 메모 기억 확인용
 * query: ?user_id=xxx&limit=50
 */
router.get('/memory', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'MISSING_USER_ID' });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = await getUserMemoryRedis(userId, CROSS_ROOM_MEMORY_DAYS, limit);

    return res.json({
      ok: true,
      items: items.map((x) => ({
        roomId: x.roomId,
        content: x.content,
        createdAt: new Date(x.ts).toISOString(),
      })),
    });
  } catch (err: any) {
    console.error('[GET /api/chat/memory] error:', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const msg = typeof err?.message === 'string' ? err.message : 'INTERNAL_ERROR';
    return res.status(status).json({ ok: false, error: msg });
  }
});

export default router;