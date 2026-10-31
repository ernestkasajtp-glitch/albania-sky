import { z } from "zod";
import { NAME_ERROR, NAME_REGEX } from "../lib/nameValidation";

export const kytePassengerName = z.string().trim()
  .min(1, "Kjo fushë është e detyrueshme.")
  .max(100, "Maksimumi 100 karaktere.")
  .regex(NAME_REGEX, NAME_ERROR);