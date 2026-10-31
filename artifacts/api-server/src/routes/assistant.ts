import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lt, ne } from "drizzle-orm";
import {
  agentsTable,
  assistantActionsTable,
  bookingChangeLogsTable,
  bookingsTable,
  db,
  flightChangeHistoryTable,
  flightsTable,
  passengersTable,
  paymentChangeLogsTable,
  paymentsTable,
  taskNotificationsTable,
  tasksTable,
} from "@workspace/db";
import {
  AskAssistantBody,
  AskAssistantResponse,
  ConfirmAssistantActionParams,
  ConfirmAssistantActionResponse,
} from "@workspace/api-zod";
import { getEffectivePermissions } from "./permissions";

const router: IRouter = Router();
const assistantSnapshotCache = new Map<
  string,
  { expiresAt: number; data?: unknown; pending?: Promise<unknown> }
>();
const ASSISTANT_CACHE_TTL_MS = 20_000;
const ASSISTANT_CACHE_MAX_ENTRIES = 50;
const ASSISTANT_ACTION_TTL_MS = 10 * 60_000;

type AssistantActionType =
  | "task_create_self"
  | "task_set_status"
  | "booking_set_status"
  | "flight_set_confirmed"
  | "payment_confirm";

type StoredAssistantAction = {
  proposalId: string;
  userId: number;
  type: AssistantActionType;
  module: "tasks" | "bookings" | "flights" | "payments";
  title: string;
  summary: string;
  warning: string;
  path: string;
  body: Record<string, unknown>;
  precondition: Record<string, unknown>;
  expiresAt: number;
};

type ModelActionProposal = {
  type: AssistantActionType;
  targetId: number | null;
  targetRef: string | null;
  title: string | null;
  description: string | null;
  priority: "none" | "low" | "medium" | "high" | "urgent" | null;
  dueDate: string | null;
  status: string | null;
  isConfirmed: boolean | null;
  confirmNote: string | null;
  summary: string;
  warning: string;
};

function parseModelActionProposal(
  value: unknown,
):
  | { success: true; data: ModelActionProposal }
  | { success: false; issues: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { success: false, issues: ["proposal must be an object"] };
  }
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "type",
    "targetId",
    "targetRef",
    "title",
    "description",
    "priority",
    "dueDate",
    "status",
    "isConfirmed",
    "confirmNote",
    "summary",
    "warning",
  ]);
  const issues: string[] = [];
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) issues.push(`unexpected field: ${key}`);
  }
  for (const key of allowedKeys) {
    if (!(key in record)) issues.push(`missing field: ${key}`);
  }
  const types: AssistantActionType[] = [
    "task_create_self",
    "task_set_status",
    "booking_set_status",
    "flight_set_confirmed",
    "payment_confirm",
  ];
  if (typeof record.type !== "string" || !types.includes(record.type as AssistantActionType)) {
    issues.push("invalid type");
  }
  if (
    record.targetId !== null &&
    (!Number.isInteger(record.targetId) || Number(record.targetId) <= 0)
  ) {
    issues.push("invalid targetId");
  }
  const stringLimits: Record<string, number> = {
    targetRef: 40,
    title: 180,
    description: 1000,
    dueDate: 40,
    status: 40,
    confirmNote: 300,
    summary: 300,
    warning: 300,
  };
  for (const [key, limit] of Object.entries(stringLimits)) {
    const candidate = record[key];
    if (
      candidate !== null &&
      (typeof candidate !== "string" || candidate.length > limit)
    ) {
      issues.push(`invalid ${key}`);
    }
  }
  const priorities = ["none", "low", "medium", "high", "urgent"];
  if (
    record.priority !== null &&
    (typeof record.priority !== "string" ||
      !priorities.includes(record.priority))
  ) {
    issues.push("invalid priority");
  }
  if (
    record.isConfirmed !== null &&
    typeof record.isConfirmed !== "boolean"
  ) {
    issues.push("invalid isConfirmed");
  }
  if (typeof record.summary !== "string" || !record.summary.trim()) {
    issues.push("invalid summary");
  }
  if (typeof record.warning !== "string" || !record.warning.trim()) {
    issues.push("invalid warning");
  }
  if (issues.length > 0) return { success: false, issues };
  return { success: true, data: record as ModelActionProposal };
}

const tiraneDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Tirane",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function tiraneDate(date: Date): string {
  return tiraneDateFormatter.format(date);
}

function startOfTiraneDayUtc(dateText: string): Date {
  const guess = new Date(`${dateText}T00:00:00Z`);
  const hourInTirane = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Tirane",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(guess),
  );
  return new Date(guess.getTime() - hourInTirane * 60 * 60 * 1000);
}

function containsSensitiveInput(message: string): boolean {
  return [
    /\bsk-[A-Za-z0-9_-]{10,}\b/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\b(?:\+?\d[\s().-]*){7,}\b/,
    /\b(?:password|fjal[eë]kalim|credential|kredencial|api[\s_-]*key|secret|token)\b/i,
    /\b(?:passport|pasaport|pnr)\s*[:#-]?\s*[A-Z0-9]{3,}\b/i,
    /\b(?:jep|trego|shfaq|gjej|k[ëe]rko|listo|nxirr|dua)\b[\s\S]{0,80}\b(?:email|e-?mail|telefon|num[ëe]r telefoni|em(?:ri|rat)|mbiem(?:ri|rat)|adres[ëa]|pasaport[ëa]?|passport|pnr|kontakt)\b/i,
    /\b(?:customer|klient|pasagjer|passenger)\b[\s\S]{0,60}\b(?:email|telefon|em(?:ri|rat)|mbiem(?:ri|rat)|adres[ëa]|pasaport[ëa]?|passport|pnr|kontakt)\b/i,
  ].some((pattern) => pattern.test(message));
}

export async function createStoredAssistantAction(
  raw: ModelActionProposal,
  userId: number,
): Promise<StoredAssistantAction | null> {
  const type = raw.type;
  const targetId = raw.targetId;
  const targetRef = raw.targetRef?.trim().slice(0, 40) ?? "";
  let action:
    | Omit<
        StoredAssistantAction,
        "proposalId" | "userId" | "expiresAt"
      >
    | undefined;

  if (type === "task_create_self") {
    const title = raw.title?.trim().slice(0, 180) ?? "";
    const description = raw.description?.trim().slice(0, 1000) ?? "";
    const priority = raw.priority ?? "medium";
    const dueDate =
      raw.dueDate &&
      !Number.isNaN(new Date(raw.dueDate).getTime())
        ? raw.dueDate
        : null;
    if (!title) return null;
    action = {
      type,
      module: "tasks",
      title: "Krijo detyrë personale",
      summary: `Krijo detyrën “${title}” me prioritet ${priority}${dueDate ? ` dhe afat ${dueDate}` : ""}.`,
      warning: "Detyra do t'ju caktohet juve.",
      path: "/tasks",
      body: {
        title,
        description: description || null,
        status: "todo",
        priority,
        assigneeId: userId,
        dueDate,
      },
      precondition: { entity: "none" },
    };
  } else if (type === "task_set_status") {
    const statuses = ["todo", "in_progress", "in_review", "done"];
    const status = raw.status && statuses.includes(raw.status) ? raw.status : null;
    if (!targetId || !status) return null;
    const [task] = await db
      .select({ id: tasksTable.id, status: tasksTable.status })
      .from(tasksTable)
      .where(eq(tasksTable.id, targetId))
      .limit(1);
    if (!task) return null;
    action = {
      type,
      module: "tasks",
      title: "Ndrysho statusin e detyrës",
      summary: `Detyra #${targetId}: ${task.status} → ${status}.`,
      warning: "Do të ndryshohet vetëm statusi i detyrës.",
      path: `/tasks/${targetId}`,
      body: { status },
      precondition: { entity: "task", id: targetId, status: task.status },
    };
  } else if (type === "booking_set_status") {
    const status =
      raw.status === "pending" || raw.status === "confirmed"
        ? raw.status
        : null;
    let bookingId: number | null = targetId;
    if (!bookingId && targetRef) {
      const [booking] = await db
        .select({ id: bookingsTable.id })
        .from(bookingsTable)
        .where(eq(bookingsTable.bookingRef, targetRef.toUpperCase()))
        .limit(1);
      bookingId = booking?.id ?? null;
    }
    if (!bookingId || !status) return null;
    const [booking] = await db
      .select({
        id: bookingsTable.id,
        bookingRef: bookingsTable.bookingRef,
        status: bookingsTable.status,
      })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .limit(1);
    if (!booking || booking.status === "cancelled") return null;
    action = {
      type,
      module: "bookings",
      title: "Ndrysho statusin e rezervimit",
      summary: `Rezervimi ${booking.bookingRef}: ${booking.status} → ${status}.`,
      warning: "Ndryshimi mund të dërgojë njoftimet normale të statusit.",
      path: `/bookings/${bookingId}/status`,
      body: { status },
      precondition: {
        entity: "booking",
        id: bookingId,
        status: booking.status,
      },
    };
  } else if (type === "flight_set_confirmed") {
    if (!targetId || raw.isConfirmed === null) return null;
    const [flight] = await db
      .select({
        id: flightsTable.id,
        flightNumber: flightsTable.flightNumber,
        departureDate: flightsTable.departureDate,
        isConfirmed: flightsTable.isConfirmed,
      })
      .from(flightsTable)
      .where(eq(flightsTable.id, targetId))
      .limit(1);
    if (!flight) return null;
    action = {
      type,
      module: "flights",
      title: raw.isConfirmed
        ? "Konfirmo fluturimin"
        : "Hiq konfirmimin e fluturimit",
      summary: `Fluturimi ${flight.flightNumber}, ${flight.departureDate}: ${flight.isConfirmed ? "i konfirmuar" : "i pakonfirmuar"} → ${raw.isConfirmed ? "i konfirmuar" : "i pakonfirmuar"}.`,
      warning: "Do të ndryshohet vetëm fusha e konfirmimit të fluturimit.",
      path: `/flights/${targetId}`,
      body: { isConfirmed: raw.isConfirmed },
      precondition: {
        entity: "flight",
        id: targetId,
        isConfirmed: flight.isConfirmed,
      },
    };
  } else if (type === "payment_confirm") {
    const confirmNote = raw.confirmNote?.trim().slice(0, 300) ?? "";
    if (!targetId) return null;
    const [payment] = await db
      .select({
        id: paymentsTable.id,
        status: paymentsTable.status,
        confirmed: paymentsTable.confirmed,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.id, targetId))
      .limit(1);
    if (!payment || payment.status !== "completed" || payment.confirmed) return null;
    action = {
      type,
      module: "payments",
      title: "Konfirmo pagesën",
      summary: `Pagesa #${targetId}: e pakonfirmuar → e konfirmuar.`,
      warning: "Mund të dërgohet fatura e vulosur si e konfirmuar.",
      path: `/payments/${targetId}`,
      body: { confirmed: true, confirmNote: confirmNote || null },
      precondition: {
        entity: "payment",
        id: targetId,
        status: payment.status,
        confirmed: payment.confirmed,
      },
    };
  }

  if (!action) return null;
  const proposalId = crypto.randomUUID();
  const stored: StoredAssistantAction = {
    ...action,
    proposalId,
    userId,
    expiresAt: Date.now() + ASSISTANT_ACTION_TTL_MS,
  };
  await db.insert(assistantActionsTable).values({
    id: stored.proposalId,
    userId: stored.userId,
    actionType: stored.type,
    module: stored.module,
    title: stored.title,
    summary: stored.summary,
    warning: stored.warning,
    path: stored.path,
    body: stored.body,
    precondition: stored.precondition,
    status: "pending",
    expiresAt: new Date(stored.expiresAt),
  });
  return stored;
}

async function assistantPreconditionIsCurrent(
  precondition: Record<string, unknown>,
): Promise<boolean> {
  const entity = precondition.entity;
  const id = Number(precondition.id);
  if (entity === "none") return true;
  if (!Number.isInteger(id) || id <= 0) return false;

  if (entity === "task") {
    const [row] = await db
      .select({ status: tasksTable.status })
      .from(tasksTable)
      .where(eq(tasksTable.id, id));
    return Boolean(row && row.status === precondition.status);
  }
  if (entity === "booking") {
    const [row] = await db
      .select({ status: bookingsTable.status })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    return Boolean(row && row.status === precondition.status);
  }
  if (entity === "flight") {
    const [row] = await db
      .select({ isConfirmed: flightsTable.isConfirmed })
      .from(flightsTable)
      .where(eq(flightsTable.id, id));
    return Boolean(row && row.isConfirmed === precondition.isConfirmed);
  }
  if (entity === "payment") {
    const [row] = await db
      .select({
        status: paymentsTable.status,
        confirmed: paymentsTable.confirmed,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.id, id));
    return Boolean(
      row &&
        row.status === precondition.status &&
        row.confirmed === precondition.confirmed,
    );
  }
  return false;
}

function isAllowedPersistedAction(action: {
  actionType: string;
  path: string;
}): action is { actionType: AssistantActionType; path: string } {
  if (action.actionType === "task_create_self") return action.path === "/tasks";
  if (action.actionType === "task_set_status")
    return /^\/tasks\/\d+$/.test(action.path);
  if (action.actionType === "booking_set_status")
    return /^\/bookings\/\d+\/status$/.test(action.path);
  if (action.actionType === "flight_set_confirmed")
    return /^\/flights\/\d+$/.test(action.path);
  if (action.actionType === "payment_confirm")
    return /^\/payments\/\d+$/.test(action.path);
  return false;
}

router.post(
  "/assistant/actions/:proposalId/confirm",
  async (req, res): Promise<void> => {
    const params = ConfirmAssistantActionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [action] = await db
      .select()
      .from(assistantActionsTable)
      .where(eq(assistantActionsTable.id, params.data.proposalId))
      .limit(1);
    if (!action) {
      res.status(400).json({ error: "Propozimi nuk ekziston ose ka skaduar." });
      return;
    }
    if (action.userId !== req.session?.userId) {
      res.status(403).json({ error: "Ky propozim i përket një përdoruesi tjetër." });
      return;
    }
    if (action.status === "executed") {
      res.json(
        ConfirmAssistantActionResponse.parse({
          proposalId: action.id,
          status: "already_executed",
          message: action.resultMessage ?? "Veprimi është kryer më parë.",
        }),
      );
      return;
    }
    if (action.expiresAt.getTime() <= Date.now()) {
      await db
        .update(assistantActionsTable)
        .set({
          status: "failed",
          errorMessage: "Propozimi skadoi pa u konfirmuar.",
          completedAt: new Date(),
        })
        .where(
          and(
            eq(assistantActionsTable.id, action.id),
            eq(assistantActionsTable.status, "pending"),
          ),
        );
      res.status(400).json({ error: "Propozimi ka skaduar." });
      return;
    }
    if (action.status !== "pending") {
      res.status(409).json({
        error:
          action.status === "executing"
            ? "Veprimi është duke u ekzekutuar."
            : "Veprimi nuk mund të ekzekutohet përsëri.",
      });
      return;
    }
    if (!isAllowedPersistedAction(action)) {
      await db
        .update(assistantActionsTable)
        .set({
          status: "failed",
          errorMessage: "Veprim i ruajtur i pavlefshëm.",
          completedAt: new Date(),
        })
        .where(eq(assistantActionsTable.id, action.id));
      res.status(400).json({ error: "Veprimi i propozuar është i pavlefshëm." });
      return;
    }

    const [claimed] = await db
      .update(assistantActionsTable)
      .set({ status: "executing", confirmedAt: new Date() })
      .where(
        and(
          eq(assistantActionsTable.id, action.id),
          eq(assistantActionsTable.userId, req.session?.userId ?? -1),
          eq(assistantActionsTable.status, "pending"),
        ),
      )
      .returning();
    if (!claimed) {
      res.status(409).json({ error: "Veprimi u konfirmua tashmë." });
      return;
    }

    try {
      if (!(await assistantPreconditionIsCurrent(claimed.precondition))) {
        await db
          .update(assistantActionsTable)
          .set({
            status: "failed",
            errorMessage:
              "Objekti ndryshoi pas krijimit të propozimit. Kërko një propozim të ri.",
            completedAt: new Date(),
          })
          .where(eq(assistantActionsTable.id, claimed.id));
        res.status(409).json({
          error:
            "Të dhënat kanë ndryshuar. Kërko një propozim të ri para konfirmimit.",
        });
        return;
      }

      const port = process.env.PORT ?? "3000";
      const response = await fetch(
        `http://127.0.0.1:${port}/api${claimed.path}`,
        {
          method:
            claimed.actionType === "task_create_self" ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.cookie ?? "",
            "X-AI-Action": claimed.id,
            "X-AI-Expected-Status":
              typeof claimed.precondition.status === "string"
                ? claimed.precondition.status
                : "",
            "X-AI-Expected-Confirmed":
              typeof claimed.precondition.isConfirmed === "boolean"
                ? String(claimed.precondition.isConfirmed)
                : typeof claimed.precondition.confirmed === "boolean"
                  ? String(claimed.precondition.confirmed)
                  : "",
          },
          body: JSON.stringify(claimed.body),
          signal: AbortSignal.timeout(60_000),
        },
      );
      const text = await response.text();
      if (!response.ok) {
        let message = text;
        try {
          const payload = JSON.parse(text) as { error?: string };
          message = payload.error ?? text;
        } catch {
          // Use the bounded plain-text response below.
        }
        const errorMessage =
          message.slice(0, 500) || "Veprimi nuk mund të kryhej.";
        const uncertain = response.status >= 500;
        await db
          .update(assistantActionsTable)
          .set({
            status: uncertain ? "uncertain" : "failed",
            errorMessage,
            completedAt: new Date(),
          })
          .where(eq(assistantActionsTable.id, claimed.id));
        res.status(response.status).json({
          error: uncertain
            ? "Rezultati i veprimit është i paqartë. Kontrolloni modulin përpara se të provoni përsëri."
            : errorMessage,
        });
        return;
      }

      const resultMessage = "Veprimi u krye me sukses.";
      await db
        .update(assistantActionsTable)
        .set({
          status: "executed",
          resultMessage,
          completedAt: new Date(),
        })
        .where(eq(assistantActionsTable.id, claimed.id));
      req.log.info(
        {
          userId: req.session?.userId,
          role: req.session?.role,
          proposalId: claimed.id,
          actionType: claimed.actionType,
        },
        "AI assistant action executed",
      );
      res.json(
        ConfirmAssistantActionResponse.parse({
          proposalId: claimed.id,
          status: "executed",
          message: resultMessage,
        }),
      );
    } catch (error) {
      await db
        .update(assistantActionsTable)
        .set({
          status: "uncertain",
          errorMessage:
            "Rezultati është i paqartë pas një gabimi komunikimi; veprimi nuk do të përsëritet automatikisht.",
          completedAt: new Date(),
        })
        .where(eq(assistantActionsTable.id, action.id))
        .catch(() => {});
      req.log.error(
        { err: error, proposalId: action.id, actionType: action.actionType },
        "AI assistant action execution failed",
      );
      res.status(503).json({
        error:
          "Rezultati i veprimit është i paqartë. Kontrolloni modulin përpara se të provoni përsëri.",
      });
    }
  },
);

router.post("/assistant/query", async (req, res): Promise<void> => {
  const parsed = AskAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (containsSensitiveInput(parsed.data.message)) {
    res.status(400).json({
      error:
        "Mos shkruani email, telefon, pasaportë, PNR, API key ose të dhëna të tjera sensitive në pyetje.",
    });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OpenAI nuk është konfiguruar." });
    return;
  }

  const today = tiraneDate(new Date());
  const todayStart = startOfTiraneDayUtc(today);
  const tomorrowText = new Date(
    Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10)) + 1,
    ),
  )
    .toISOString()
    .slice(0, 10);
  const tomorrowStart = startOfTiraneDayUtc(tomorrowText);

  const isAdmin = req.session?.role === "admin";
  const currentUserId = req.session?.userId;
  const permissions = isAdmin
    ? {
        can_view_sales_report: true,
        can_view_agent_report: true,
        can_view_commission_in_reports: true,
        can_view_agent_wallet_balance: true,
      }
    : await getEffectivePermissions(
        req.session?.role ?? "",
        currentUserId,
      );

  const loadSnapshot = () =>
    Promise.all([
      db
        .select({
          status: bookingsTable.status,
          totalAmount: bookingsTable.totalAmount,
          paidAmount: bookingsTable.paidAmount,
        })
        .from(bookingsTable)
        .where(
          and(
            gte(bookingsTable.createdAt, todayStart),
            lt(bookingsTable.createdAt, tomorrowStart),
            ne(bookingsTable.status, "cancelled"),
          ),
        ),
      db
        .select({
          id: flightsTable.id,
          airline: flightsTable.airline,
          flightNumber: flightsTable.flightNumber,
          fromCity: flightsTable.fromCity,
          toCity: flightsTable.toCity,
          departureDate: flightsTable.departureDate,
          departureTime: flightsTable.departureTime,
          totalSeats: flightsTable.totalSeats,
          soldSeats: flightsTable.soldSeats,
          status: flightsTable.status,
          isConfirmed: flightsTable.isConfirmed,
          scheduleAlert: flightsTable.scheduleAlert,
          seatAlert: flightsTable.seatAlert,
          externalSalesBlocked: flightsTable.externalSalesBlocked,
          showInBookingEngine: flightsTable.showInBookingEngine,
        })
        .from(flightsTable),
      db
        .select({
          amount: paymentsTable.amount,
          method: paymentsTable.method,
          status: paymentsTable.status,
          isRefund: paymentsTable.isRefund,
          createdAt: paymentsTable.createdAt,
        })
        .from(paymentsTable),
      db
        .select({
          id: agentsTable.id,
          name: agentsTable.name,
          company: agentsTable.company,
          status: agentsTable.status,
          walletBalance: agentsTable.walletBalance,
          showInReports: agentsTable.showInReports,
        })
        .from(agentsTable),
      db
        .select({
          id: bookingsTable.id,
          agentId: bookingsTable.agentId,
          flightId: bookingsTable.flightId,
          status: bookingsTable.status,
          totalAmount: bookingsTable.totalAmount,
          paidAmount: bookingsTable.paidAmount,
          commission: bookingsTable.commission,
          source: bookingsTable.source,
          createdAt: bookingsTable.createdAt,
        })
        .from(bookingsTable)
        .where(ne(bookingsTable.status, "cancelled")),
      db
        .select({
          bookingId: passengersTable.bookingId,
          type: passengersTable.type,
          cancelled: passengersTable.cancelled,
          extraCost: passengersTable.extraCost,
        })
        .from(passengersTable),
      db
        .select({
          id: tasksTable.id,
          status: tasksTable.status,
          priority: tasksTable.priority,
          assigneeId: tasksTable.assigneeId,
          creatorId: tasksTable.creatorId,
          dueDate: tasksTable.dueDate,
          entityType: tasksTable.entityType,
          autoGenerated: tasksTable.autoGenerated,
          watchers: tasksTable.watchers,
        })
        .from(tasksTable)
        .orderBy(desc(tasksTable.createdAt)),
      db
        .select({
          type: taskNotificationsTable.type,
          readAt: taskNotificationsTable.readAt,
          createdAt: taskNotificationsTable.createdAt,
        })
        .from(taskNotificationsTable)
        .where(eq(taskNotificationsTable.userId, currentUserId ?? -1))
        .orderBy(desc(taskNotificationsTable.createdAt))
        .limit(100),
      isAdmin
        ? db
            .select({
              action: bookingChangeLogsTable.action,
              fieldName: bookingChangeLogsTable.fieldName,
              userRole: bookingChangeLogsTable.userRole,
              createdAt: bookingChangeLogsTable.createdAt,
            })
            .from(bookingChangeLogsTable)
            .orderBy(desc(bookingChangeLogsTable.createdAt))
            .limit(100)
        : Promise.resolve([]),
      isAdmin
        ? db
            .select({
              source: flightChangeHistoryTable.source,
              userRole: flightChangeHistoryTable.userRole,
              createdAt: flightChangeHistoryTable.createdAt,
            })
            .from(flightChangeHistoryTable)
            .orderBy(desc(flightChangeHistoryTable.createdAt))
            .limit(100)
        : Promise.resolve([]),
      isAdmin
        ? db
            .select({
              action: paymentChangeLogsTable.action,
              fieldName: paymentChangeLogsTable.fieldName,
              userRole: paymentChangeLogsTable.userRole,
              createdAt: paymentChangeLogsTable.createdAt,
            })
            .from(paymentChangeLogsTable)
            .orderBy(desc(paymentChangeLogsTable.createdAt))
            .limit(100)
        : Promise.resolve([]),
    ]);
  type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;
  const cacheKey = `${isAdmin ? "admin" : "user"}:${currentUserId ?? -1}`;
  const now = Date.now();
  for (const [key, entry] of assistantSnapshotCache) {
    if (entry.expiresAt <= now && !entry.pending) {
      assistantSnapshotCache.delete(key);
    }
  }
  while (assistantSnapshotCache.size >= ASSISTANT_CACHE_MAX_ENTRIES) {
    const oldestKey = assistantSnapshotCache.keys().next().value as
      | string
      | undefined;
    if (!oldestKey) break;
    assistantSnapshotCache.delete(oldestKey);
  }
  const cached = assistantSnapshotCache.get(cacheKey) as
    | { expiresAt: number; data?: Snapshot; pending?: Promise<Snapshot> }
    | undefined;
  let snapshot: Snapshot;
  if (cached?.data && cached.expiresAt > now) {
    snapshot = cached.data;
  } else if (cached?.pending) {
    snapshot = await cached.pending;
  } else {
    const pending = loadSnapshot();
    assistantSnapshotCache.set(cacheKey, {
      expiresAt: now + ASSISTANT_CACHE_TTL_MS,
      pending,
    });
    try {
      snapshot = await pending;
      assistantSnapshotCache.set(cacheKey, {
        expiresAt: Date.now() + ASSISTANT_CACHE_TTL_MS,
        data: snapshot,
      });
    } catch (error) {
      assistantSnapshotCache.delete(cacheKey);
      throw error;
    }
  }
  const [
    todayBookings,
    allFlights,
    allPayments,
    agents,
    activeBookings,
    allPassengers,
    allTasks,
    userNotifications,
    recentBookingAudit,
    recentFlightAudit,
    recentPaymentAudit,
  ] = snapshot;

  const todayPayments = allPayments.filter(
    (payment) =>
      payment.createdAt >= todayStart && payment.createdAt < tomorrowStart,
  );
  const upcomingFlights = allFlights.filter(
    (flight) => flight.departureDate >= today,
  );

  const bookingsByStatus: Record<string, number> = {};
  for (const booking of todayBookings) {
    bookingsByStatus[booking.status] = (bookingsByStatus[booking.status] ?? 0) + 1;
  }

  const lowSeatFlights = upcomingFlights
    .map((flight) => ({
      ...flight,
      availableSeats: Math.max(0, flight.totalSeats - flight.soldSeats),
    }))
    .filter((flight) => flight.status === "open" && flight.availableSeats <= 10)
    .sort(
      (a, b) =>
        a.availableSeats - b.availableSeats ||
        a.departureDate.localeCompare(b.departureDate),
    )
    .slice(0, 30);

  const paymentMethods: Record<string, number> = {};
  let todayPaymentTotal = 0;
  for (const payment of todayPayments) {
    if (payment.status !== "completed") continue;
    const signedAmount =
      Number(payment.amount) * (payment.isRefund ? -1 : 1);
    todayPaymentTotal += signedAmount;
    paymentMethods[payment.method] =
      (paymentMethods[payment.method] ?? 0) + signedAmount;
  }

  const bookingToAgent = new Map<number, number | null>();
  const bookingToFlight = new Map<number, number>();
  const activeBookingIds = new Set<number>();
  const debtByAgent = new Map<
    number,
    {
      sales: number;
      paid: number;
      commission: number;
      bookings: number;
      passengers: number;
    }
  >();
  for (const booking of activeBookings) {
    activeBookingIds.add(booking.id);
    bookingToAgent.set(booking.id, booking.agentId);
    bookingToFlight.set(booking.id, booking.flightId);
    if (booking.agentId == null) continue;
    const current = debtByAgent.get(booking.agentId) ?? {
      sales: 0,
      paid: 0,
      commission: 0,
      bookings: 0,
      passengers: 0,
    };
    current.sales += Number(booking.totalAmount);
    current.paid += Math.min(
      Number(booking.paidAmount),
      Number(booking.totalAmount),
    );
    current.commission += Number(booking.commission);
    current.bookings += 1;
    debtByAgent.set(booking.agentId, current);
  }

  const passengerTypes: Record<string, number> = {};
  const passengersByBooking = new Map<number, number>();
  const passengersByFlight = new Map<number, number>();
  let activePassengerCount = 0;
  let passengerExtrasTotal = 0;
  for (const passenger of allPassengers) {
    if (passenger.cancelled || !activeBookingIds.has(passenger.bookingId)) continue;
    activePassengerCount += 1;
    passengerExtrasTotal += Number(passenger.extraCost);
    passengerTypes[passenger.type] = (passengerTypes[passenger.type] ?? 0) + 1;
    passengersByBooking.set(
      passenger.bookingId,
      (passengersByBooking.get(passenger.bookingId) ?? 0) + 1,
    );
    const agentId = bookingToAgent.get(passenger.bookingId);
    if (agentId != null) {
      const current = debtByAgent.get(agentId);
      if (current) current.passengers += 1;
    }
    const flightId = bookingToFlight.get(passenger.bookingId);
    if (flightId != null) {
      passengersByFlight.set(
        flightId,
        (passengersByFlight.get(flightId) ?? 0) + 1,
      );
    }
  }

  const agentPerformance = agents
    .filter((agent) => agent.showInReports)
    .map((agent) => {
      const totals = debtByAgent.get(agent.id) ?? {
        sales: 0,
        paid: 0,
        commission: 0,
        bookings: 0,
        passengers: 0,
      };
      return {
        name: agent.name,
        company: agent.company,
        status: agent.status,
        totalBookings: totals.bookings,
        totalPassengers: totals.passengers,
        totalSales: Math.round(totals.sales),
        totalPaid: Math.round(totals.paid),
        debt: Math.max(0, Math.round(totals.sales - totals.paid)),
        commission: Math.round(totals.commission),
        walletBalance: Math.round(Number(agent.walletBalance)),
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 100);

  const increment = (
    target: Record<string, number>,
    key: string | null | undefined,
    amount = 1,
  ): void => {
    const safeKey = key?.trim() || "E paspecifikuar";
    target[safeKey] = (target[safeKey] ?? 0) + amount;
  };

  const flightStatuses: Record<string, number> = {};
  const flightsByAirline: Record<string, number> = {};
  const flightsByRoute: Record<string, number> = {};
  let totalFlightSeats = 0;
  let totalSoldSeats = 0;
  let activeScheduleAlerts = 0;
  let activeSeatAlerts = 0;
  for (const flight of allFlights) {
    increment(flightStatuses, flight.status);
    increment(flightsByAirline, flight.airline);
    increment(flightsByRoute, `${flight.fromCity} → ${flight.toCity}`);
    totalFlightSeats += flight.totalSeats;
    totalSoldSeats += flight.soldSeats;
    if (flight.scheduleAlert) activeScheduleAlerts += 1;
    if (flight.seatAlert) activeSeatAlerts += 1;
  }

  const bookingStatusesAllTime: Record<string, number> = {};
  const bookingsBySource: Record<string, number> = {};
  const bookingDaily: Record<
    string,
    { bookings: number; sales: number; paid: number; passengers: number }
  > = {};
  const ninetyDaysAgo = new Date(
    Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10)) - 89,
    ),
  )
    .toISOString()
    .slice(0, 10);
  for (const booking of activeBookings) {
    increment(bookingStatusesAllTime, booking.status);
    increment(bookingsBySource, booking.source);
    const date = tiraneDate(booking.createdAt);
    if (date < ninetyDaysAgo) continue;
    const daily = bookingDaily[date] ?? {
      bookings: 0,
      sales: 0,
      paid: 0,
      passengers: 0,
    };
    daily.bookings += 1;
    daily.sales += Math.round(Number(booking.totalAmount));
    daily.paid += Math.round(Number(booking.paidAmount));
    daily.passengers += passengersByBooking.get(booking.id) ?? 0;
    bookingDaily[date] = daily;
  }

  const paymentsByMethodAllTime: Record<string, number> = {};
  const paymentsByStatusAllTime: Record<string, number> = {};
  const paymentDaily: Record<string, { count: number; netTotal: number }> = {};
  let completedPaymentsNetAllTime = 0;
  for (const payment of allPayments) {
    increment(paymentsByStatusAllTime, payment.status);
    if (payment.status !== "completed") continue;
    const amount = Number(payment.amount) * (payment.isRefund ? -1 : 1);
    completedPaymentsNetAllTime += amount;
    increment(paymentsByMethodAllTime, payment.method, Math.round(amount));
    const date = tiraneDate(payment.createdAt);
    if (date < ninetyDaysAgo) continue;
    const daily = paymentDaily[date] ?? { count: 0, netTotal: 0 };
    daily.count += 1;
    daily.netTotal += Math.round(amount);
    paymentDaily[date] = daily;
  }

  const visibleTasks = allTasks.filter(
    (task) =>
      isAdmin ||
      (currentUserId != null &&
        (task.assigneeId === currentUserId ||
          task.creatorId === currentUserId ||
          task.watchers.includes(currentUserId))),
  );
  const tasksByStatus: Record<string, number> = {};
  const tasksByPriority: Record<string, number> = {};
  const tasksByEntity: Record<string, number> = {};
  for (const task of visibleTasks) {
    increment(tasksByStatus, task.status);
    increment(tasksByPriority, task.priority);
    increment(tasksByEntity, task.entityType);
  }

  const auditActionCounts: Record<string, number> = {};
  const auditFieldCounts: Record<string, number> = {};
  for (const item of recentBookingAudit) {
    increment(auditActionCounts, `booking:${item.action}`);
    increment(auditFieldCounts, item.fieldName);
  }
  for (const item of recentFlightAudit) {
    increment(auditActionCounts, `flight:${item.source}`);
  }
  for (const item of recentPaymentAudit) {
    increment(auditActionCounts, `payment:${item.action}`);
    increment(auditFieldCounts, item.fieldName);
  }

  const canViewSales = permissions.can_view_sales_report === true;
  const canViewAgentReport = permissions.can_view_agent_report === true;
  const canViewCommission =
    permissions.can_view_commission_in_reports === true;
  const canViewWallet =
    permissions.can_view_agent_wallet_balance === true;
  const visibleAgentPerformance = canViewAgentReport
    ? agentPerformance.map((agent) => ({
        name: agent.name,
        company: agent.company,
        status: agent.status,
        totalBookings: agent.totalBookings,
        totalPassengers: agent.totalPassengers,
        ...(canViewSales
          ? {
              totalSales: agent.totalSales,
              totalPaid: agent.totalPaid,
              debt: agent.debt,
            }
          : {}),
        ...(canViewCommission ? { commission: agent.commission } : {}),
        ...(canViewWallet ? { walletBalance: agent.walletBalance } : {}),
      }))
    : [];

  const operationalContext = {
    date: today,
    timezone: "Europe/Tirane",
    scope:
      "Read-only aggregates without passenger/customer names, contacts, passport data, PNR, notes, payment references, API keys or partner API data.",
    bookingsToday: {
      count: todayBookings.length,
      ...(canViewSales
        ? {
            totalSales: Math.round(
              todayBookings.reduce(
                (sum, booking) => sum + Number(booking.totalAmount),
                0,
              ),
            ),
            totalPaid: Math.round(
              todayBookings.reduce(
                (sum, booking) => sum + Number(booking.paidAmount),
                0,
              ),
            ),
          }
        : {
            financialsRestricted:
              "Përdoruesi nuk ka lejen can_view_sales_report.",
          }),
      byStatus: bookingsByStatus,
    },
    systemTotals: {
      flights: allFlights.length,
      bookingsActive: activeBookings.length,
      passengersActive: activePassengerCount,
      agentsShownInReports: canViewAgentReport
        ? visibleAgentPerformance.length
        : undefined,
      tasksVisibleToUser: visibleTasks.length,
      completedPaymentsNet: canViewSales
        ? Math.round(completedPaymentsNetAllTime)
        : undefined,
      passengerExtrasTotal: canViewSales
        ? Math.round(passengerExtrasTotal)
        : undefined,
    },
    flights: {
      byStatus: flightStatuses,
      byAirline: flightsByAirline,
      byRoute: flightsByRoute,
      totalSeats: totalFlightSeats,
      soldSeats: totalSoldSeats,
      availableSeats: Math.max(0, totalFlightSeats - totalSoldSeats),
      activeScheduleAlerts,
      activeSeatAlerts,
      upcoming: upcomingFlights
        .sort(
          (a, b) =>
            a.departureDate.localeCompare(b.departureDate) ||
            a.departureTime.localeCompare(b.departureTime),
        )
        .slice(0, 120)
        .map((flight) => ({
          id: flight.id,
          airline: flight.airline,
          flightNumber: flight.flightNumber,
          route: `${flight.fromCity} → ${flight.toCity}`,
          departureDate: flight.departureDate,
          departureTime: flight.departureTime,
          status: flight.status,
          confirmed: flight.isConfirmed,
          totalSeats: flight.totalSeats,
          soldSeats: flight.soldSeats,
          availableSeats: Math.max(0, flight.totalSeats - flight.soldSeats),
          passengerCount: passengersByFlight.get(flight.id) ?? 0,
          externalSalesBlocked: flight.externalSalesBlocked,
          visibleInBookingEngine: flight.showInBookingEngine,
          hasScheduleAlert: Boolean(flight.scheduleAlert),
          hasSeatAlert: Boolean(flight.seatAlert),
        })),
    },
    bookingsAllTime: {
      byStatus: bookingStatusesAllTime,
      bySource: bookingsBySource,
      last90DaysByDay: canViewSales
        ? bookingDaily
        : Object.fromEntries(
            Object.entries(bookingDaily).map(([date, value]) => [
              date,
              {
                bookings: value.bookings,
                passengers: value.passengers,
              },
            ]),
          ),
    },
    passengers: {
      totalActive: activePassengerCount,
      byType: passengerTypes,
      extrasTotal: canViewSales ? Math.round(passengerExtrasTotal) : undefined,
    },
    lowSeatUpcomingFlights: lowSeatFlights,
    paymentsToday: canViewSales
      ? {
          count: todayPayments.filter(
            (payment) => payment.status === "completed",
          ).length,
          netTotal: Math.round(todayPaymentTotal),
          byMethod: Object.fromEntries(
            Object.entries(paymentMethods).map(([method, amount]) => [
              method,
              Math.round(amount),
            ]),
          ),
        }
      : { restricted: "Kërkohet leja can_view_sales_report." },
    paymentsAllTime: canViewSales
      ? {
          count: allPayments.length,
          completedNetTotal: Math.round(completedPaymentsNetAllTime),
          byMethodNetAmount: paymentsByMethodAllTime,
          byStatus: paymentsByStatusAllTime,
          last90DaysByDay: paymentDaily,
        }
      : { restricted: "Kërkohet leja can_view_sales_report." },
    agentPerformance: canViewAgentReport
      ? visibleAgentPerformance
      : { restricted: "Kërkohet leja can_view_agent_report." },
    tasks: {
      byStatus: tasksByStatus,
      byPriority: tasksByPriority,
      byEntityType: tasksByEntity,
      overdueCount: visibleTasks.filter(
        (task) =>
          task.dueDate != null &&
          task.dueDate < new Date() &&
          task.status !== "done" &&
          task.status !== "cancelled",
      ).length,
      recentMetadata: visibleTasks.slice(0, 50).map((task) => ({
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        entityType: task.entityType,
        autoGenerated: task.autoGenerated,
      })),
    },
    notificationsForCurrentUser: {
      unreadCount: userNotifications.filter((item) => item.readAt == null).length,
      byType: userNotifications.reduce<Record<string, number>>((result, item) => {
        increment(result, item.type);
        return result;
      }, {}),
    },
    audit:
      isAdmin
        ? {
            note: "Counts cover the 100 most recent events per audit category.",
            byAction: auditActionCounts,
            byField: auditFieldCounts,
          }
        : { note: "Detailed audit overview is available only to admins." },
  };

  req.log.info(
    {
      userId: req.session?.userId,
      role: req.session?.role,
      questionLength: parsed.data.message.length,
    },
    "AI assistant query",
  );

  try {
    const openAiRequestBody = JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      max_completion_tokens: 1200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "assistant_answer_with_optional_action",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["answer", "proposal"],
            properties: {
              answer: { type: "string" },
              proposal: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "type", "targetId", "targetRef", "title",
                      "description", "priority", "dueDate", "status",
                      "isConfirmed", "confirmNote", "summary", "warning",
                    ],
                    properties: {
                      type: {
                        type: "string",
                        enum: [
                          "task_create_self",
                          "task_set_status",
                          "booking_set_status",
                          "flight_set_confirmed",
                          "payment_confirm",
                        ],
                      },
                      targetId: { type: ["integer", "null"] },
                      targetRef: { type: ["string", "null"] },
                      title: { type: ["string", "null"] },
                      description: { type: ["string", "null"] },
                      priority: {
                        anyOf: [
                          { type: "null" },
                          {
                            type: "string",
                            enum: ["none", "low", "medium", "high", "urgent"],
                          },
                        ],
                      },
                      dueDate: { type: ["string", "null"] },
                      status: { type: ["string", "null"] },
                      isConfirmed: { type: ["boolean", "null"] },
                      confirmNote: { type: ["string", "null"] },
                      summary: { type: "string" },
                      warning: { type: "string" },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "Ti je asistenti i një sistemi fluturimesh. Përgjigju vetëm në shqip, shkurt dhe qartë. Përdor vetëm të dhënat në kontekst dhe mos shpik. Për pyetje informative kthe proposal=null. Vetëm kur përdoruesi kërkon qartë një ndryshim, përgatit NJË proposal të lejuar; mos thuaj se veprimi është kryer. Veprimet e vetme: krijim detyre personale; status detyre todo/in_progress/in_review/done; status rezervimi pending/confirmed; isConfirmed të fluturimit; konfirmim pagese. Për çdo veprim tjetër kthe proposal=null dhe shpjego se nuk mbështetet. Asnjëherë mos propozo anulim, fshirje, ndryshim çmimi/vendesh, refund, wallet, përdorues/leje, partner API ose SQL. Shumat janë në euro.",
        },
        {
          role: "user",
          content: `PYETJA:\n${parsed.data.message}\n\nKONTEKSTI READ-ONLY:\n${JSON.stringify(operationalContext)}`,
        },
      ],
    });
    let content = "";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const openAiResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: openAiRequestBody,
        signal: AbortSignal.timeout(45_000),
        },
      );

      if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        let errorCode: string | undefined;
        try {
          const parsedError = JSON.parse(errorText) as {
            error?: { code?: string; type?: string };
          };
          errorCode = parsedError.error?.code ?? parsedError.error?.type;
        } catch {
          // Keep the provider's generic error handling when the response is not JSON.
        }
        req.log.error(
          {
            attempt,
            status: openAiResponse.status,
            errorCode,
            errorText: errorText.slice(0, 500),
          },
          "OpenAI assistant request failed",
        );
        if (
          errorCode === "credit_balance_exhausted" ||
          errorCode === "insufficient_quota"
        ) {
          res
            .status(503)
            .json({ error: "Llogaria OpenAI nuk ka kredit të disponueshëm." });
          return;
        }
        res
          .status(503)
          .json({ error: "OpenAI nuk është i disponueshëm për momentin." });
        return;
      }

      const payload = (await openAiResponse.json()) as {
        choices?: Array<{
          finish_reason?: string | null;
          message?: { content?: string };
        }>;
      };
      content = payload.choices?.[0]?.message?.content?.trim() ?? "";
      if (content) break;
      req.log.warn(
        {
          attempt,
          finishReason: payload.choices?.[0]?.finish_reason ?? null,
          choiceCount: payload.choices?.length ?? 0,
        },
        "OpenAI assistant returned an empty response",
      );
    }

    if (!content) {
      res.status(503).json({ error: "OpenAI nuk ktheu përgjigje." });
      return;
    }
    const modelResult = JSON.parse(content) as {
      answer?: string;
      proposal?: Record<string, unknown> | null;
    };
    const answer = modelResult.answer?.trim();
    if (!answer) {
      res.status(503).json({ error: "OpenAI nuk ktheu përgjigje të vlefshme." });
      return;
    }
    let storedAction: StoredAssistantAction | null = null;
    if (modelResult.proposal && currentUserId) {
      const parsedProposal = parseModelActionProposal(modelResult.proposal);
      if (!parsedProposal.success) {
        req.log.warn(
          {
            userId: currentUserId,
            issues: parsedProposal.issues,
          },
          "AI assistant returned an invalid action proposal",
        );
      } else {
        storedAction = await createStoredAssistantAction(
          parsedProposal.data,
          currentUserId,
        );
      }
    }

    res.json(
      AskAssistantResponse.parse({
        answer,
        generatedAt: new Date().toISOString(),
        proposal: storedAction
          ? {
              proposalId: storedAction.proposalId,
              type: storedAction.type,
              module: storedAction.module,
              title: storedAction.title,
              summary: storedAction.summary,
              warning: storedAction.warning,
              expiresAt: new Date(storedAction.expiresAt).toISOString(),
            }
          : null,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "OpenAI assistant request error");
    res
      .status(503)
      .json({ error: "OpenAI nuk është i disponueshëm për momentin." });
  }
});

export default router;