import express, { Request, Response } from 'express';
import cors from 'cors';
import 'dotenv/config';
import OpenAI from 'openai';

// ===== 타입 =====
type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  userId: string;
  role: ChatRole;
  content: string;
  createdAt: string; // ISO
}

// ===== 기본 세팅 =====
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// OpenAI 클라이언트 (Responses API용)
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// 메모리에만 저장하는 임시 로그 (나중에 DB로 바꾸면 됨)
const chatLog: ChatMessage[] = [];

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
      max_output_tokens: 512,
    });

    const text = (response as any).output_text as string | undefined;
    return text ?? '';
  } catch (err) {
    console.error('callLLM error:', err);
    throw err;
  }
}

// ===== API: /api/chat =====
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { userId, message } = req.body as { userId: string; message: string };

    if (!userId || !message) {
      return res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });
    }

    const now = new Date().toISOString();

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      userId,
      role: 'user',
      content: message,
      createdAt: now,
    };
    chatLog.push(userMsg);

    const replyText = await callLLM(message);

    const aiMsg: ChatMessage = {
      id: `a_${Date.now()}`,
      userId,
      role: 'assistant',
      content: replyText,
      createdAt: new Date().toISOString(),
    };
    chatLog.push(aiMsg);

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

// ===== API: /api/chat/log =====
app.get('/api/chat/log', (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'MISSING_USER_ID' });
  }

  const logs = chatLog.filter((m) => m.userId === userId);
  return res.json({ ok: true, items: logs });
});

// ===== 서버 시작 =====
app.listen(PORT, () => {
  console.log(`✅ API server listening on http://localhost:${PORT}`);
});
