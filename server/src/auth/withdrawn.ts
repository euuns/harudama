import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { RowDataPacket } from 'mysql2/promise';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

interface UserRow extends RowDataPacket {
    user_id: number;
    password_hash: string;
    is_withdrawn: 'Y' | 'N';
}

/* 
 회원탈퇴 API (POST /api/auth/withdrawn)
 클라이언트에서 보낸 비밀번호와 JWT 토큰을 검증한 뒤, 일치하면 탈퇴 처리(is_withdrawn = 'Y')
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        const { password } = req.body;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ ok: false, error: 'NO_TOKEN', message: '로그인이 필요합니다.' });
        }

        if (!password) {
            return res.status(400).json({ ok: false, error: 'PASSWORD_MISSING', message: '비밀번호를 입력해주세요.' });
        }

        const token = authHeader.split(' ')[1];
        let decoded: any;

        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err: any) {
            return res.status(401).json({ ok: false, error: 'INVALID_TOKEN', message: '유효하지 않은 토큰입니다.' });
        }

        // DB에서 사용자 정보 조회
        const [rows] = await pool.query<UserRow[]>(
            'SELECT user_id, password_hash, is_withdrawn FROM users WHERE user_id = ? LIMIT 1',
            [decoded.userId]
        );

        if (!rows.length) {
            return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다.' });
        }

        const user = rows[0];

        // 이미 탈퇴한 사용자인지 확인
        if (user.is_withdrawn === 'Y') {
            return res.status(400).json({ ok: false, error: 'ALREADY_WITHDRAWN', message: '이미 탈퇴한 사용자입니다.' });
        }

        // 비밀번호 검증
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ ok: false, error: 'INVALID_PASSWORD', message: '비밀번호가 일치하지 않습니다.' });
        }

        // 비밀번호가 맞다면 탈퇴 처리 (Soft Delete)
        await pool.execute(
            `UPDATE users SET is_withdrawn = 'Y', withdrawn_date = NOW() WHERE user_id = ?`,
            [user.user_id]
        );

        console.log('[AUTH_LOG] User Withdrawn Success:', {
            userId: user.user_id,
            time: new Date().toISOString()
        });

        return res.json({ ok: true, message: '성공적으로 탈퇴되었습니다.' });

    } catch (error) {
        console.error('[POST /api/auth/withdrawn]', error);
        return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: '서버 에러가 발생했습니다.' });
    }
});

export default router;