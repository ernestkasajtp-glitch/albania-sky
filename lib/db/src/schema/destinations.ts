import { pgTable, serial, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";

export const destinationsTable = pgTable("destinations", {
  id:          serial("id").primaryKey(),
  itinerary:   text("itinerary").notNull(),
  displayName: text("display_name").notNull(),
  priceMode:   text("price_mode").notNull().default("auto"),
  manualDate:  date("manual_date"),
  photoUrl:    text("photo_url"),
  sortOrder:   integer("sort_order").notNull().default(0),
  active:      boolean("active").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
