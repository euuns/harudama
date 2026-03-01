// src/index.ts
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import './db';           // DB 연결 테스트용
import chatRouter from './routes/chat';
import signupRouter from './auth/signup'; // 회원가입 동작을 위한 라우터
import loginRouter from './auth/login'; // 로그인 기능 동작을 위한 라우터
import authcheckRouter from './auth/authcheck'; // 토큰 검증(자동로그인)용 라우터
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

app.use('/api/chat', chatRouter);

// /api/auth 경로로 들어오는 로그인/회원가입 동작
app.use('/api/auth/signup', signupRouter);
app.use('/api/auth/login', loginRouter);
app.use('/api/auth/authcheck', authcheckRouter);

// 헬스체크용
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Harudama API 서버 동작 중' });
});

app.listen(PORT, () => {
  console.log(`api 서버 주소임 http://localhost:${PORT}`);
});
