import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, groupTicketsTable, groupTicketSalesTable, groupTicketAlternativesTable, bookingUsersTable } from "@workspace/db";
import multer from "multer";
import ExcelJS from "exceljs";
import { Readable } from "stream";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const ALLOWED_ROLES = ["admin", "manager"];

function requireAdminOrManager(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).session;
  if (!session?.userId || !ALLOWED_ROLES.includes(session.role ?? "")) {
    res.status(403).json({ error: "Akses i ndaluar. Vetëm admin ose manager." });
    return;
  }
  next();
}

async function getFullGroupTicket(id: number) {
  const [ticket] = await db.select().from(groupTicketsTable).where(eq(groupTicketsTable.id, id));
  if (!ticket) return null;

  const sales = await db.select().from(groupTicketSalesTable).where(eq(groupTicketSalesTable.groupTicketId, id));
  const alternatives = await db.select().from(groupTicketAlternativesTable).where(eq(groupTicketAlternativesTable.groupTicketId, id));

  const seatsSoldTotal = sales.reduce((sum, s) => sum + (s.seatsSold ?? 0), 0);

  return {
    ...ticket,
    pricePerSeat: ticket.pricePerSeat != null ? Number(ticket.pricePerSeat) : null,
    seatsSoldTotal,
    seatsRemaining: ticket.totalSeats - seatsSoldTotal,
    sales: sales.map(s => ({
      ...s,
      price: s.price != null ? Number(s.price) : null,
      commission: s.commission != null ? Number(s.commission) : null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    alternatives: alternatives.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
    comments: Array.isArray((ticket as any).comments) ? (ticket as any).comments : [],
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

router.get("/group-tickets", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const tickets = await db.select().from(groupTicketsTable).orderBy(groupTicketsTable.createdAt);
    const full = await Promise.all(tickets.map(t => getFullGroupTicket(t.id)));
    res.json(full.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch group tickets" });
  }
});

router.get("/group-tickets/by-id/:id", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "ID e pavlefshme" });
      return;
    }
    const full = await getFullGroupTicket(id);
    if (!full) {
      res.status(404).json({ error: "Grupi nuk u gjet" });
      return;
    }
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch group ticket" });
  }
});

router.get("/group-tickets/search", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const { from, to, date, persons } = req.query;
    if (!from || !to || !date) {
      res.status(400).json({ error: "from, to dhe date janë të detyrueshme" });
      return;
    }
    const fromCode = String(from).trim().toUpperCase();
    const toCode = String(to).trim().toUpperCase();
    const dateStr = String(date).trim();
    const personsNum = persons ? Math.max(1, Number(persons)) : 1;

    const result = await db.execute(sql`
      WITH
      from_set AS (
        -- Direct match
        SELECT ${fromCode}::text AS airport
        UNION
        -- Forward: fromCode is the main airport → its alternatives
        SELECT aa.alternative_airport FROM airport_alternatives aa WHERE aa.main_airport = ${fromCode}
        UNION
        -- Reverse: fromCode is listed as an alternative → include that main airport
        SELECT aa.main_airport FROM airport_alternatives aa WHERE aa.alternative_airport = ${fromCode}
      ),
      to_set AS (
        -- Direct match
        SELECT ${toCode}::text AS airport
        UNION
        -- Forward: toCode is the main airport → its alternatives
        SELECT aa.alternative_airport FROM airport_alternatives aa WHERE aa.main_airport = ${toCode}
        UNION
        -- Reverse: toCode is listed as an alternative → include that main airport
        SELECT aa.main_airport FROM airport_alternatives aa WHERE aa.alternative_airport = ${toCode}
      ),
      sales_agg AS (
        SELECT group_ticket_id, COALESCE(SUM(seats_sold), 0)::int AS sold
        FROM group_ticket_sales
        WHERE status != 'CANCELED'
        GROUP BY group_ticket_id
      )
      SELECT
        gt.*,
        COALESCE(sa.sold, 0)::int AS seats_sold_total,
        (gt.total_seats - COALESCE(sa.sold, 0))::int AS seats_remaining,
        (SELECT STRING_AGG(airport, ',' ORDER BY airport) FROM from_set) AS matched_from_set,
        (SELECT STRING_AGG(airport, ',' ORDER BY airport) FROM to_set) AS matched_to_set,
        CASE
          WHEN
            (gt.total_seats - COALESCE(sa.sold, 0)) >= ${personsNum}
            AND (
              (gt.status = 'CHANGE'
                AND ${dateStr}::date BETWEEN
                  (gt.flight_date::date - gt.date_flex_back)
                AND
                  (gt.flight_date::date + gt.date_flex_forward)
              )
              OR (gt.status != 'CHANGE' AND gt.flight_date = ${dateStr})
            )
          THEN 'full'
          ELSE 'partial'
        END AS match_type
      FROM group_tickets gt
      LEFT JOIN sales_agg sa ON sa.group_ticket_id = gt.id
      WHERE
        gt.departure IN (SELECT airport FROM from_set)
        AND gt.destination IN (SELECT airport FROM to_set)
      ORDER BY
        CASE WHEN
          (gt.total_seats - COALESCE(sa.sold, 0)) >= ${personsNum}
          AND (
            (gt.status = 'CHANGE'
              AND ${dateStr}::date BETWEEN
                (gt.flight_date::date - gt.date_flex_back)
              AND
                (gt.flight_date::date + gt.date_flex_forward)
            )
            OR (gt.status != 'CHANGE' AND gt.flight_date = ${dateStr})
          )
        THEN 0 ELSE 1 END,
        gt.flight_date
    `);

    const rows = (result.rows as any[]).map(r => ({
      id: r.id,
      pnrOriginal: r.pnr_original,
      departure: r.departure,
      destination: r.destination,
      flightDate: r.flight_date,
      flightTime: r.flight_time,
      totalSeats: r.total_seats,
      pricePerSeat: r.price_per_seat != null ? Number(r.price_per_seat) : null,
      color: r.color,
      status: r.status,
      airline: r.airline,
      dateFlexBack: r.date_flex_back,
      dateFlexForward: r.date_flex_forward,
      notes: r.notes,
      seatsSoldTotal: r.seats_sold_total,
      seatsRemaining: r.seats_remaining,
      matchedFromSet: r.matched_from_set?.split(",").filter(Boolean) ?? [fromCode],
      matchedToSet: r.matched_to_set?.split(",").filter(Boolean) ?? [toCode],
      matchType: r.match_type as "full" | "partial",
      searchFrom: fromCode,
      searchTo: toCode,
    }));

    res.json(rows);
  } catch (err: any) {
    console.error("[group-tickets/search]", err?.message, err?.stack);
    res.status(500).json({ error: "Search failed", detail: err?.message });
  }
});

router.post("/group-tickets/import", requireAdminOrManager, upload.single("file"), async (req, res): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const filename = req.file.originalname?.toLowerCase() ?? "";
    if (filename.endsWith(".csv")) {
      await (workbook.csv as any).load(Readable.from(req.file.buffer));
    } else {
      await workbook.xlsx.load(req.file.buffer as any);
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("No worksheet found");

    const allRows: any[][] = [];
    worksheet.eachRow((row) => {
      const vals: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        const v = cell.value;
        vals[colIdx - 1] = (v != null && typeof v === "object" && "richText" in (v as any))
          ? (v as any).richText.map((r: any) => r.text ?? "").join("")
          : (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? "");
      });
      allRows.push(vals);
    });

    if (allRows.length < 2) {
      res.status(400).json({ error: "File is empty or has no data rows" });
      return;
    }

    const headers = allRows[0].map((h: any) => String(h ?? "").trim());
    const preview = allRows.slice(1, 6).map(row =>
      Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))
    );

    const systemFields = [
      { key: "pnrOriginal", label: "PNR Original" },
      { key: "departure", label: "Nisja (DEPA)" },
      { key: "destination", label: "Destinacioni (DEST)" },
      { key: "flightDate", label: "Data e Fluturimit" },
      { key: "flightTime", label: "Ora" },
      { key: "airline", label: "Kompania Ajrore" },
      { key: "totalSeats", label: "Vendeve Totale" },
      { key: "pricePerSeat", label: "Çmimi për Vend" },
      { key: "color", label: "Ngjyra" },
      { key: "status", label: "Statusi" },
      { key: "installment1", label: "K1 (€)" },
      { key: "installment2", label: "K2 (€)" },
      { key: "installment3", label: "K3 (€)" },
      { key: "notes", label: "Shënime" },
    ];

    res.json({ headers, preview, systemFields });
  } catch (err) {
    res.status(500).json({ error: "Failed to parse Excel file" });
  }
});

router.post("/group-tickets/import/confirm", requireAdminOrManager, upload.single("file"), async (req, res): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const mapping: Record<string, string> = JSON.parse(req.body.mapping ?? "{}");

    const workbook2 = new ExcelJS.Workbook();
    const filename2 = req.file.originalname?.toLowerCase() ?? "";
    if (filename2.endsWith(".csv")) {
      await (workbook2.csv as any).load(Readable.from(req.file.buffer));
    } else {
      await workbook2.xlsx.load(req.file.buffer as any);
    }
    const worksheet2 = workbook2.worksheets[0];
    if (!worksheet2) throw new Error("No worksheet found");

    const allRows2: any[][] = [];
    worksheet2.eachRow((row) => {
      const vals: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        const v = cell.value;
        vals[colIdx - 1] = (v != null && typeof v === "object" && "richText" in (v as any))
          ? (v as any).richText.map((r: any) => r.text ?? "").join("")
          : (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? "");
      });
      allRows2.push(vals);
    });

    if (allRows2.length < 2) {
      res.status(400).json({ error: "File is empty" });
      return;
    }

    const headers = allRows2[0].map((h: any) => String(h ?? "").trim());
    const dataRows = allRows2.slice(1);

    let imported = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowData: Record<string, any> = {};
      headers.forEach((h, idx) => { rowData[h] = row[idx] ?? ""; });

      const getValue = (fieldKey: string) => {
        const colName = mapping[fieldKey];
        if (!colName) return undefined;
        return rowData[colName];
      };

      const pnrOriginal = String(getValue("pnrOriginal") ?? "").trim();
      const departure = String(getValue("departure") ?? "").trim();
      const destination = String(getValue("destination") ?? "").trim();
      const flightDate = String(getValue("flightDate") ?? "").trim();

      try {
        await db.insert(groupTicketsTable).values({
          pnrOriginal: pnrOriginal || null,
          departure: departure || null,
          destination: destination || null,
          flightDate: flightDate || null,
          flightTime: String(getValue("flightTime") ?? "").trim() || null,
          returnFlightDate: String(getValue("returnFlightDate") ?? "").trim() || null,
          returnFlightTime: String(getValue("returnFlightTime") ?? "").trim() || null,
          airline: String(getValue("airline") ?? "").trim() || null,
          totalSeats: Number(getValue("totalSeats") ?? 0) || 0,
          pricePerSeat: getValue("pricePerSeat") != null && getValue("pricePerSeat") !== "" ? String(Number(getValue("pricePerSeat"))) : null,
          color: String(getValue("color") ?? "ORANGE").trim().toUpperCase() || "ORANGE",
          status: String(getValue("status") ?? "").trim(),
          purchaseDate: String(getValue("purchaseDate") ?? "").trim() || null,
          country: String(getValue("country") ?? "").trim() || null,
          installment1: getValue("installment1") != null && getValue("installment1") !== "" ? String(Number(getValue("installment1"))) : null,
          installment2: getValue("installment2") != null && getValue("installment2") !== "" ? String(Number(getValue("installment2"))) : null,
          installment3: getValue("installment3") != null && getValue("installment3") !== "" ? String(Number(getValue("installment3"))) : null,
          notes: String(getValue("notes") ?? "").trim() || null,
          dateFlexBack: 14,
          dateFlexForward: 30,
        });
        imported++;
      } catch (e) {
        errors.push(`Rreshti ${i + 2}: gabim gjatë importit`);
      }
    }

    res.json({ imported, errors, total: dataRows.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to import Excel file" });
  }
});

router.post("/group-tickets", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const { sales, alternatives, ...data } = req.body;
    const [ticket] = await db.insert(groupTicketsTable).values({
      pnrOriginal: data.pnrOriginal,
      departure: data.departure,
      destination: data.destination,
      flightDate: data.flightDate,
      flightTime: data.flightTime ?? null,
      returnInfo: data.returnInfo ?? null,
      totalSeats: Number(data.totalSeats ?? 0),
      pricePerSeat: data.pricePerSeat != null ? String(data.pricePerSeat) : null,
      color: data.color ?? "ORANGE",
      status: data.status ?? "",
      airline: data.airline ?? null,
      dateFlexBack: Number(data.dateFlexBack ?? 14),
      dateFlexForward: Number(data.dateFlexForward ?? 30),
      notes: data.notes ?? null,
      options: data.options ?? null,
      purchaseDate: data.purchaseDate ?? null,
      installment1: data.installment1 != null ? String(data.installment1) : null,
      installment2: data.installment2 != null ? String(data.installment2) : null,
      installment3: data.installment3 != null ? String(data.installment3) : null,
      country: data.country ?? null,
      returnFlightDate: data.returnFlightDate ?? null,
      returnFlightTime: data.returnFlightTime ?? null,
    }).returning();

    if (alternatives && Array.isArray(alternatives)) {
      for (const alt of alternatives) {
        if (alt.destination) {
          await db.insert(groupTicketAlternativesTable).values({
            groupTicketId: ticket.id,
            destination: alt.destination,
            notes: alt.notes ?? null,
          });
        }
      }
    }

    const full = await getFullGroupTicket(ticket.id);
    res.status(201).json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to create group ticket" });
  }
});

router.put("/group-tickets/:id", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { sales, alternatives, ...data } = req.body;

    const [existing] = await db.select({ id: groupTicketsTable.id }).from(groupTicketsTable).where(eq(groupTicketsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Group ticket not found" });
      return;
    }

    await db.update(groupTicketsTable).set({
      pnrOriginal: data.pnrOriginal,
      departure: data.departure,
      destination: data.destination,
      flightDate: data.flightDate,
      flightTime: data.flightTime ?? null,
      returnInfo: data.returnInfo ?? null,
      totalSeats: data.totalSeats != null ? Number(data.totalSeats) : undefined,
      pricePerSeat: data.pricePerSeat != null ? String(data.pricePerSeat) : null,
      color: data.color,
      status: data.status,
      airline: data.airline ?? null,
      dateFlexBack: data.dateFlexBack != null ? Number(data.dateFlexBack) : undefined,
      dateFlexForward: data.dateFlexForward != null ? Number(data.dateFlexForward) : undefined,
      notes: data.notes ?? null,
      options: data.options ?? null,
      purchaseDate: data.purchaseDate ?? null,
      installment1: data.installment1 != null ? String(data.installment1) : null,
      installment2: data.installment2 != null ? String(data.installment2) : null,
      installment3: data.installment3 != null ? String(data.installment3) : null,
      country: data.country ?? null,
      returnFlightDate: data.returnFlightDate ?? null,
      returnFlightTime: data.returnFlightTime ?? null,
    }).where(eq(groupTicketsTable.id, id));

    if (alternatives !== undefined && Array.isArray(alternatives)) {
      await db.delete(groupTicketAlternativesTable).where(eq(groupTicketAlternativesTable.groupTicketId, id));
      for (const alt of alternatives) {
        if (alt.destination) {
          await db.insert(groupTicketAlternativesTable).values({
            groupTicketId: id,
            destination: alt.destination,
            notes: alt.notes ?? null,
          });
        }
      }
    }

    const full = await getFullGroupTicket(id);
    if (!full) {
      res.status(404).json({ error: "Group ticket not found" });
      return;
    }
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to update group ticket" });
  }
});

router.patch("/group-tickets/:id/installments", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { installment1, installment2, installment3 } = req.body;
    const setData: Record<string, any> = {};
    if ("installment1" in req.body) setData.installment1 = installment1 != null && installment1 !== "" ? String(installment1) : null;
    if ("installment2" in req.body) setData.installment2 = installment2 != null && installment2 !== "" ? String(installment2) : null;
    if ("installment3" in req.body) setData.installment3 = installment3 != null && installment3 !== "" ? String(installment3) : null;
    if (Object.keys(setData).length === 0) { res.json({ ok: true }); return; }
    await db.update(groupTicketsTable).set(setData).where(eq(groupTicketsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update installments" });
  }
});

router.delete("/group-tickets/:id", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select({ id: groupTicketsTable.id }).from(groupTicketsTable).where(eq(groupTicketsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Group ticket not found" });
      return;
    }
    await db.delete(groupTicketsTable).where(eq(groupTicketsTable.id, id));
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: "Failed to delete group ticket" });
  }
});

router.post("/group-tickets/:id/sales", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const groupTicketId = Number(req.params.id);

    const [ticket] = await db.select({ id: groupTicketsTable.id }).from(groupTicketsTable).where(eq(groupTicketsTable.id, groupTicketId));
    if (!ticket) {
      res.status(404).json({ error: "Group ticket not found" });
      return;
    }

    const data = req.body;
    const [sale] = await db.insert(groupTicketSalesTable).values({
      groupTicketId,
      departureAirport: data.departureAirport ?? null,
      arrivalAirport: data.arrivalAirport ?? null,
      pnrNew: data.pnrNew ?? null,
      seatsSold: Number(data.seatsSold ?? 1),
      passengerName: data.passengerName ?? null,
      status: data.status ?? "WAITING",
      confirmedDate: data.confirmedDate ?? null,
      returnConfirmedDate: data.returnConfirmedDate ?? null,
      shiturDate: data.shiturDate ?? null,
      operatorName: data.operatorName ?? null,
      price: data.price != null ? String(data.price) : null,
      paymentStatus: data.paymentStatus ?? null,
      commission: data.commission != null ? String(data.commission) : null,
      email: data.email ?? null,
      notes: data.notes ?? null,
      bookingRef: data.bookingRef ?? null,
      bookingPassengerId: data.bookingPassengerId != null ? Number(data.bookingPassengerId) : null,
    }).returning();

    res.status(201).json({
      ...sale,
      price: sale.price != null ? Number(sale.price) : null,
      commission: sale.commission != null ? Number(sale.commission) : null,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create sale" });
  }
});

router.put("/group-tickets/:id/sales/:saleId", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const groupTicketId = Number(req.params.id);
    const saleId = Number(req.params.saleId);
    const data = req.body;

    const [sale] = await db.update(groupTicketSalesTable).set({
      departureAirport: data.departureAirport ?? null,
      arrivalAirport: data.arrivalAirport ?? null,
      pnrNew: data.pnrNew ?? null,
      seatsSold: data.seatsSold != null ? Number(data.seatsSold) : undefined,
      passengerName: data.passengerName ?? null,
      status: data.status,
      confirmedDate: data.confirmedDate ?? null,
      returnConfirmedDate: data.returnConfirmedDate ?? null,
      shiturDate: data.shiturDate ?? null,
      operatorName: data.operatorName ?? null,
      price: data.price != null ? String(data.price) : null,
      paymentStatus: data.paymentStatus ?? null,
      commission: data.commission != null ? String(data.commission) : null,
      email: data.email ?? null,
      notes: data.notes ?? null,
      bookingRef: data.bookingRef ?? null,
      bookingPassengerId: data.bookingPassengerId != null ? Number(data.bookingPassengerId) : null,
    }).where(and(
      eq(groupTicketSalesTable.id, saleId),
      eq(groupTicketSalesTable.groupTicketId, groupTicketId)
    )).returning();

    if (!sale) {
      res.status(404).json({ error: "Sale not found" });
      return;
    }

    res.json({
      ...sale,
      price: sale.price != null ? Number(sale.price) : null,
      commission: sale.commission != null ? Number(sale.commission) : null,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update sale" });
  }
});

router.delete("/group-tickets/:id/sales/:saleId", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const groupTicketId = Number(req.params.id);
    const saleId = Number(req.params.saleId);

    const [existing] = await db.select({ id: groupTicketSalesTable.id })
      .from(groupTicketSalesTable)
      .where(and(eq(groupTicketSalesTable.id, saleId), eq(groupTicketSalesTable.groupTicketId, groupTicketId)));

    if (!existing) {
      res.status(404).json({ error: "Sale not found" });
      return;
    }

    await db.delete(groupTicketSalesTable).where(and(
      eq(groupTicketSalesTable.id, saleId),
      eq(groupTicketSalesTable.groupTicketId, groupTicketId)
    ));
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: "Failed to delete sale" });
  }
});

router.post("/group-tickets/:id/alternatives", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const groupTicketId = Number(req.params.id);

    const [ticket] = await db.select({ id: groupTicketsTable.id }).from(groupTicketsTable).where(eq(groupTicketsTable.id, groupTicketId));
    if (!ticket) {
      res.status(404).json({ error: "Group ticket not found" });
      return;
    }

    const data = req.body;
    const [alt] = await db.insert(groupTicketAlternativesTable).values({
      groupTicketId,
      destination: data.destination,
      notes: data.notes ?? null,
    }).returning();

    res.status(201).json({ ...alt, createdAt: alt.createdAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: "Failed to create alternative" });
  }
});

router.delete("/group-tickets/:id/alternatives/:altId", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const groupTicketId = Number(req.params.id);
    const altId = Number(req.params.altId);

    const [existing] = await db.select({ id: groupTicketAlternativesTable.id })
      .from(groupTicketAlternativesTable)
      .where(and(eq(groupTicketAlternativesTable.id, altId), eq(groupTicketAlternativesTable.groupTicketId, groupTicketId)));

    if (!existing) {
      res.status(404).json({ error: "Alternative not found" });
      return;
    }

    await db.delete(groupTicketAlternativesTable).where(and(
      eq(groupTicketAlternativesTable.id, altId),
      eq(groupTicketAlternativesTable.groupTicketId, groupTicketId)
    ));
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: "Failed to delete alternative" });
  }
});

// ── Group ticket comments (immutable, append-only thread) ─────────────────
router.post("/group-tickets/:id/comments", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const groupTicketId = Number(req.params.id);
    if (!Number.isFinite(groupTicketId)) {
      res.status(400).json({ error: "Invalid group ticket id" });
      return;
    }
    const text = String(req.body?.text ?? "").trim();
    const replyTo = req.body?.replyTo != null ? String(req.body.replyTo) : null;
    if (!text) {
      res.status(400).json({ error: "Komenti është bosh" });
      return;
    }
    if (text.length > 2000) {
      res.status(400).json({ error: "Komenti është shumë i gjatë (max 2000 karaktere)" });
      return;
    }

    const [ticket] = await db.select().from(groupTicketsTable).where(eq(groupTicketsTable.id, groupTicketId));
    if (!ticket) {
      res.status(404).json({ error: "Group ticket not found" });
      return;
    }

    const session = (req as any).session;
    let authorName = "Përdorues";
    if (session?.userId) {
      const [u] = await db.select({ name: bookingUsersTable.name, email: bookingUsersTable.email })
        .from(bookingUsersTable).where(eq(bookingUsersTable.id, session.userId));
      if (u) authorName = u.name || u.email || authorName;
    }

    const existing = Array.isArray((ticket as any).comments) ? (ticket as any).comments : [];

    // Validate replyTo exists in the thread (if provided)
    if (replyTo && !existing.find((c: any) => c.id === replyTo)) {
      res.status(400).json({ error: "Komenti që po i përgjigjeni nuk ekziston" });
      return;
    }

    const newComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      author: authorName,
      authorId: session?.userId ?? null,
      createdAt: new Date().toISOString(),
      replyTo: replyTo || null,
    };

    const updated = [...existing, newComment];
    await db.update(groupTicketsTable)
      .set({ comments: updated as any })
      .where(eq(groupTicketsTable.id, groupTicketId));

    const full = await getFullGroupTicket(groupTicketId);
    res.status(201).json(full);
  } catch (err) {
    console.error("[group-tickets/comments] failed:", err);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

export default router;
