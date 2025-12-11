// src/index.ts
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import './db';           // DB 연결 테스트용 (선택)
import chatRouter from './routes/chat';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// 여기서 /api/chat 으로 chatRouter 전체 붙이기
app.use('/api/chat', chatRouter);

// 헬스체크용
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Harudama API 서버 동작 중' });
});

app.listen(PORT, () => {
  console.log(`api 서버 주소임 http://localhost:${PORT}`);
});
