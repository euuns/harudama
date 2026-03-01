import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = '7d';

/* =====================
 * 타입
 * ===================== */

interface UserRow extends RowDataPacket {
  user_id: number;
  email: string;
  password_hash: string;
  is_withdrawn: 'Y' | 'N';
}


/* =====================
 * 회원가입 API (POST /api/auth/signup)
 * ===================== */

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      password,
      phoneNumber,
      birthDate,
      gender,
    } = req.body;

    //필수값 2차검증
    if (!email || !password || !name || !phoneNumber || !birthDate || !gender) {
      return res.status(400).json({ ok: false, error: 'REQUIRED_FIELD_MISSING' });
    }

    //이메일중복체크
    const [exists1] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM users WHERE email = ? LIMIT 1`,
      [email],
    );
    if (exists1.length > 0) {
      return res.status(409).json({ ok: false, error: 'EMAIL_ALREADY_EXISTS' });
    }

    // 연락처중복체크
    const [exists2] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM users WHERE phone_number = ? LIMIT 1`,
      [phoneNumber],
    );
    if (exists2.length > 0) {
      return res.status(409).json({ ok: false, error: 'PHONENUMBER_ALREADY_EXISTS' });
    }

    //추후 개발할것 핸드폰 인증 / 카카오 가입 / 

    const passwordHash = await bcrypt.hash(password, 10); //비밀번호 암호화 (보안수준 10이 적합)
    const now = new Date();

    const [result] = await pool.execute<ResultSetHeader>(
      `
      INSERT INTO users
      (name, email, password_hash, phone_number, birth_date, gender, auth_provider, signup_date)
      VALUES (?, ?, ?, ?, ?, ?, 'LOCAL', ?)
      `,
      [name, email, passwordHash, phoneNumber, birthDate, gender, now],
    );

    const userId = result.insertId;


    return res.json({
      ok: true,
      user: { userId, email, name }, 
    });
  } catch (err) {
    console.error('[POST api/auth/signup] 서버 에러 발생:', err);

    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
