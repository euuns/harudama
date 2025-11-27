import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// 헬스체크용 엔드포인트
app.get('/health', (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'dev' });
});

// TODO: 나중에 /api/chat 같은 라우트 추가
// app.use('/api/chat', chatRouter);

export default app;
