import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const brandingTable = pgTable("branding", {
  id: serial("id").primaryKey(),
  siteName: text("site_name").notNull().default("FMS Pro"),
  tagline: text("tagline").notNull().default("Kings Travel · Panel i Administrimit"),
  logoBase64: text("logo_base64"),
  backgroundBase64: text("background_base64"),
  primaryColor: text("primary_color").notNull().default("#3b82f6"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
