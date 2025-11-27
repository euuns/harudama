import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.send("Harudama Express Server Running with TypeScript!");
});

app.get("/hello", (req: Request, res: Response) => {
  return res.json({
    message: "서버 연결 성공",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 TypeScript Server running on http://localhost:${PORT}`);
});
