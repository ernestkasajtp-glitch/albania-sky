import { Router, type IRouter, type Request, type Response } from "express";
import { db, teamChatMessagesTable, bookingUsersTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { broadcastTeamChat } from "../lib/teamChatWs";

const router: IRouter = Router();

// GET /team-chat/messages?limit=100
router.get("/team-chat/messages", async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
  const rows = await db.select().from(teamChatMessagesTable)
    .orderBy(desc(teamChatMessagesTable.createdAt))
    .limit(limit);
  res.json(rows.reverse());
});

// POST /team-chat/messages { message }
router.post("/team-chat/messages", async (req: Request, res: Response) => {
  const userId = (req as any).session?.userId;
  const role = (req as any).session?.role;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const message = String(req.body?.message ?? "").trim();
  if (!message) { res.status(400).json({ error: "Message required" }); return; }
  if (message.length > 2000) { res.status(400).json({ error: "Message too long" }); return; }

  // Resolve author name
  let authorName = (req as any).session?.userName || "Përdorues";
  try {
    const [u] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
    if (u) authorName = u.name || u.email || authorName;
  } catch {}

  const [created] = await db.insert(teamChatMessagesTable).values({
    authorId: userId,
    authorName,
    authorRole: role || "manager",
    message,
  }).returning();

  broadcastTeamChat({ type: "message", data: created });
  res.json(created);
});

export default router;
