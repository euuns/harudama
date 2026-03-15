import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;

router.get("/", async (req: Request, res: Response) => {

  try {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "TOKEN_MISSING" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      email: string;
    };

    const userId = decoded.userId;

    const [rows] = await pool.execute(
      `
      SELECT
        s.id,
        s.title,
        s.schedule_date,
        s.status,
        c.content AS related_chat
      FROM schedule s
      LEFT JOIN chat_messages c
        ON s.chat_message_id = c.id
      WHERE s.user_id = ?
      AND s.deleted_at IS NULL
      ORDER BY s.schedule_date
      `,
      [userId]
    );

    res.json(rows);

  } catch (err) {

    console.error("calendar error:", err);
    res.status(401).json({ error: "INVALID_TOKEN" });

  }

});

export default router;