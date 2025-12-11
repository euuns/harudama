// src/routes/chat.ts
import { Router, Request, Response } from 'express';
import 'dotenv/config';
import OpenAI from 'openai';
import { pool } from '../db';

// ===== 타입 =====
type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: number;
  role: ChatRole;
  content: string;
  createdAt: string; // ISO
}

// ===== OpenAI 세팅 =====
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ===== OpenAI GPT-5 mini 호출 함수 =====
async function callLLM(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY 가 설정되어 있지 않습니다. .env를 확인해주세요.');
    return '서버에 OpenAI 키가 설정되어 있지 않아서 더미 응답을 돌려줍니다.';
  }

  try {
    const response = await openai.responses.create({
      model: 'gpt-5-mini',
      instructions:
        '너는 사용자의 일상, 일정, 운동, 고민 등을 들어주고 답변해주는 한국어 비서야. 항상 한국어로 자연스럽게 대답해.',
      input: prompt,
      max_output_tokens: 2048,
    });

    const text = (response as any).output_text as string | undefined;
    return text ?? '';
  } catch (err) {
    console.error('callLLM error:', err);
    throw err;
  }
}

// ===== Router 생성 =====
const router = Router();

// POST /api/chat
router.post('/', async (req: Request, res: Response) => {
  try {
    const { message } = req.body as { message: string; userId?: string };

    if (!message || !message.trim()) {
      return res.status(400).json({ ok: false, error: 'MISSING_MESSAGE' });
    }

    const now = new Date();

    // 1) user 메시지 DB 저장
    const [userResult] = await pool.execute<any>(
      'INSERT INTO chat_message (role, content, created_at) VALUES (?, ?, ?)',
      ['user', message.trim(), now],
    );

    const userMsg: ChatMessage = {
      id: Number(userResult.insertId),
      role: 'user',
      content: message.trim(),
      createdAt: now.toISOString(),
    };

    // 2) LLM 호출
    const replyText = await callLLM(message.trim());
    const replyTime = new Date();

    // 3) assistant 메시지 DB 저장
    const [aiResult] = await pool.execute<any>(
      'INSERT INTO chat_message (role, content, created_at) VALUES (?, ?, ?)',
      ['assistant', replyText, replyTime],
    );

    const aiMsg: ChatMessage = {
      id: Number(aiResult.insertId),
      role: 'assistant',
      content: replyText,
      createdAt: replyTime.toISOString(),
    };

    return res.json({
      ok: true,
      reply: aiMsg,
    });
  } catch (err: any) {
    console.error('[/api/chat] error:', err);

    const msg =
      typeof err?.message === 'string'
        ? err.message
        : 'INTERNAL_ERROR';

    return res.status(500).json({ ok: false, error: msg });
  }
});

// GET /api/chat/log
// - 최근 limit 개 (기본 50개) 리턴
router.get('/log', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;

    const [rows] = await pool.query<any[]>(
      `
      SELECT id, role, content, created_at
      FROM chat_message
      ORDER BY id DESC
      LIMIT ?
    `,
      [limit],
    );

    const items: ChatMessage[] = (rows as any[])
      .map((row) => ({
        id: Number(row.id),
        role: row.role as ChatRole,
        content: row.content as string,
        createdAt: (row.created_at as Date).toISOString(),
      }))
      .reverse();

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[/api/chat/log] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
