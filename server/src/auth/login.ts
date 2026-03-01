import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'; // 토큰 발급을 위해 jsonwebtoken 임포트 활성화
import { pool } from '../db';
import { RowDataPacket } from 'mysql2/promise';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = '7d';

/* =====================
 * 타입
 * ===================== */
interface UserRow extends RowDataPacket {
  user_id: number;
  email: string;
  phone_number: string | null;
  password_hash: string;
  name: string;
  is_withdrawn: 'Y' | 'N';
}

/* 
 로그인 API (POST /api/auth/login)
 클라이언트(앱)에서 넘겨준 ID와 비밀번호를 DB와 대조하여 로그인 성공 여부를 결정
 */

router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, password } = req.body;

    if (!id || !password) {
      return res.status(400).json({
        ok: false,
        error: 'ID_OR_PASSWORD_MISSING',
      });
    }

    // 이메일인지 휴대폰인지 판별
    const isEmail = String(id).includes('@');

    //로그인 회원 정보 받기
    const [rows] = await pool.query<UserRow[]>(
      `
      SELECT user_id, email, phone_number, password_hash, name, is_withdrawn
      FROM users
      WHERE ${isEmail ? 'email' : 'phone_number'} = ?
      LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      return res.status(401).json({
        ok: false,
        error: 'INVALID_CREDENTIALS',
      });
    }

    //유저 정보
    const user = rows[0];

    // 탈퇴자 로그인 방지
    if (user.is_withdrawn === 'Y') {
      return res.status(403).json({
        ok: false,
        error: 'WITHDRAWN_USER',
      });
    }

    //암호화 비번 검증
    const match = await bcrypt.compare(password, user.password_hash);

    //비밀번호 불일치
    if (!match) {
      return res.status(401).json({
        ok: false,
        error: 'INVALID_CREDENTIALS',
      });
    }

    //마지막 로그인 시간 업뎃
    await pool.execute(
      `UPDATE users SET last_login_date = NOW() WHERE user_id = ?`,
      [user.user_id],
    );

    //jwt 생성
    //유저id랑 이메일를 페이로드에 담아 토큰 서명
    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    //로그인 활동 로그 출력
    console.log('[AUTH_LOG] Login Success:', {
      userId: user.user_id,
      email: user.email,
      time: new Date().toISOString()
    });

    return res.json({
      ok: true,
      token, // 클라이언트 측으로 생성된 토큰을 전달
      user: {
        userId: user.user_id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    console.log('JWT_SECRET:', process.env.JWT_SECRET); //토큰키테스트
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
    });
  }
});

export default router;
