import { pgTable, serial, text, integer, numeric, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const groupTicketsTable = pgTable("group_tickets", {
  id: serial("id").primaryKey(),
  pnrOriginal: text("pnr_original"),
  departure: text("departure"),
  destination: text("destination"),
  flightDate: text("flight_date"),
  flightTime: text("flight_time"),
  returnInfo: text("return_info"),
  totalSeats: integer("total_seats").notNull().default(0),
  pricePerSeat: numeric("price_per_seat", { precision: 10, scale: 2 }),
  color: text("color").notNull().default("ORANGE"),
  status: text("status").notNull().default("open"),
  airline: text("airline"),
  dateFlexBack: integer("date_flex_back").notNull().default(14),
  dateFlexForward: integer("date_flex_forward").notNull().default(30),
  notes: text("notes"),
  options: text("options"),
  purchaseDate: text("purchase_date"),
  installment1: numeric("installment_1", { precision: 10, scale: 2 }),
  installment2: numeric("installment_2", { precision: 10, scale: 2 }),
  installment3: numeric("installment_3", { precision: 10, scale: 2 }),
  country: text("country"),
  returnFlightDate: text("return_flight_date"),
  returnFlightTime: text("return_flight_time"),
  comments: jsonb("comments").$type<Array<{ id: string; text: string; author?: string; authorId?: number; createdAt: string; replyTo?: string | null }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const groupTicketSalesTable = pgTable("group_ticket_sales", {
  id: serial("id").primaryKey(),
  groupTicketId: integer("group_ticket_id").notNull().references(() => groupTicketsTable.id, { onDelete: "cascade" }),
  departureAirport: text("departure_airport"),
  arrivalAirport: text("arrival_airport"),
  pnrNew: text("pnr_new"),
  seatsSold: integer("seats_sold").notNull().default(1),
  passengerName: text("passenger_name"),
  status: text("status").notNull().default("WAITING"),
  confirmedDate: text("confirmed_date"),
  returnConfirmedDate: text("return_confirmed_date"),
  shiturDate: text("shitur_date"),
  operatorName: text("operator_name"),
  price: numeric("price", { precision: 10, scale: 2 }),
  paymentStatus: text("payment_status"),
  commission: numeric("commission", { precision: 10, scale: 2 }),
  email: text("email"),
  notes: text("notes"),
  bookingRef: text("booking_ref"),
  bookingPassengerId: integer("booking_passenger_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const groupTicketAlternativesTable = pgTable("group_ticket_alternatives", {
  id: serial("id").primaryKey(),
  groupTicketId: integer("group_ticket_id").notNull().references(() => groupTicketsTable.id, { onDelete: "cascade" }),
  destination: text("destination").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGroupTicketSchema = createInsertSchema(groupTicketsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGroupTicketSaleSchema = createInsertSchema(groupTicketSalesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGroupTicketAlternativeSchema = createInsertSchema(groupTicketAlternativesTable).omit({ id: true, createdAt: true });

export type GroupTicket = typeof groupTicketsTable.$inferSelect;
export type GroupTicketSale = typeof groupTicketSalesTable.$inferSelect;
export type GroupTicketAlternative = typeof groupTicketAlternativesTable.$inferSelect;
export type InsertGroupTicket = z.infer<typeof insertGroupTicketSchema>;
export type InsertGroupTicketSale = z.infer<typeof insertGroupTicketSaleSchema>;
export type InsertGroupTicketAlternative = z.infer<typeof insertGroupTicketAlternativeSchema>;
