import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { RowDataPacket } from 'mysql2/promise';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

interface UserRow extends RowDataPacket {
    user_id: number;
    email: string;
    name: string;
}

/*
 토큰 검증 및 내 정보 조회 API (GET /api/auth/authcheck)
 클라이언트에서 보낸 헤더(Authorization)의 JWT 검증 후 로그인 유지 상태 확인
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ ok: false, error: 'NO_TOKEN', message: '토큰 미발행' });
        }

        const token = authHeader.split(' ')[1];

        // 토큰 디코딩 및 검증
        let decoded: any;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err: any) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ ok: false, error: 'TOKEN_EXPIRED', message: '토큰이 만료되었습니다.' });
            }
            return res.status(401).json({ ok: false, error: 'INVALID_TOKEN', message: '유효하지 않은 토큰입니다.' });
        }

        // DB에서 유저 정보가 아직 유효한지 한 번 더 확인 (유저의 탈퇴 여부 체크)
        const [rows] = await pool.query<UserRow[]>(
            'SELECT user_id, email, name FROM users WHERE user_id = ? AND is_withdrawn = "N" LIMIT 1',
            [decoded.userId]
        );

        if (!rows.length) {
            return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없거나 탈퇴한 회원입니다.' });
        }

        // Auth 활동 로그 출력
        console.log('[AUTH_LOG] Auth Check Success:', {
            userId: rows[0].user_id,
            email: rows[0].email,
            path: req.originalUrl,
            time: new Date().toISOString()
        });

        return res.json({
            ok: true,
            user: {
                userId: rows[0].user_id,
                email: rows[0].email,
                name: rows[0].name,
            }
        });

    } catch (error) {
        console.error('[GET /api/auth/authcheck]', error);
        return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: '서버 에러가 발생했습니다.' });
    }
});

export default router;
