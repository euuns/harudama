import { pool } from "../db";
import { detectScheduleCommand, parseSchedule } from "../utils/scheduleParser";

export async function handleSchedule(
  userId: string,
  message: string,
  chatMessageId?: number
) {

  if (!detectScheduleCommand(message)) {
    return;
  }

  const { title, scheduleDate } = parseSchedule(message);

  console.log("PARSED:", message, scheduleDate);

  await pool.execute(
    `
    INSERT INTO schedule
    (user_id, chat_message_id, title, schedule_date, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', NOW())
    `,
    [userId, chatMessageId ?? null, title, scheduleDate]
  );
}