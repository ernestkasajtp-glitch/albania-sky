import { useEffect, useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, CalendarClock, ClipboardCheck, ContactRound, LockKeyhole, Plane, ShieldAlert, UserRound } from "lucide-react";
import { Form } from "@/components/ui/form";
import { kytePassengerName } from "./kyte-booking-name-validation";
import "./kyte-booking-form.css";

export type KyteBookingSegment = {
  flightNumber: string;
  carrier: string;
  departure: { airport: string; date: string; time: string };
  arrival: { airport: string; date: string; time: string };
};

export type KyteBookingOffer = {
  airline: string;
  priceMinor: number;
  currency: { code: string; decimals: number };
  journeys: { segments: KyteBookingSegment[]; totalDurationMinutes: number | null }[];
  bookingToken: string;
  expiresAt?: string | null;
};

export type KytePassengerSlot = { id: string; type: "adult" | "child" | "infant"; age?: number };
export type KyteBookingPassenger = {
  firstName: string;
  lastName: string;
  title: "MR" | "MRS" | "MS" | "MISS" | "MSTR";
  gender: "MALE" | "FEMALE";
  dateOfBirth: string;
};
export type KyteBookingDetails = {
  passengers: KyteBookingPassenger[];
  contactEmail: string;
  phoneCountryCode: string;
  phoneNumber: string;
  address?: { addressLines: string[]; city: string; postalCode: string; countryCode: string };
};
export type KyteBookingFormProps = {
  offer: KyteBookingOffer;
  passengerSlots: KytePassengerSlot[];
  isSubmitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (details: KyteBookingDetails) => void | Promise<void>;
};

const dateIsValid = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const passengerSchema = z.object({
  firstName: kytePassengerName,
  lastName: kytePassengerName,
  title: z.enum(["MR", "MRS", "MS", "MISS", "MSTR"], { required_error: "Zgjidhni titullin.", invalid_type_error: "Zgjidhni titullin." }),
  gender: z.enum(["MALE", "FEMALE"], { required_error: "Zgjidhni gjininë.", invalid_type_error: "Zgjidhni gjininë." }),
  dateOfBirth: z.string().min(1, "Vendosni datën e lindjes.").refine(dateIsValid, "Vendosni një datë të vlefshme.").refine(value => !dateIsValid(value) || value <= today(), "Data e lindjes nuk mund të jetë në të ardhmen."),
});
const schema = z.object({
  passengers: z.array(passengerSchema).min(1, "Duhet të ketë të paktën një pasagjer."),
  contactEmail: z.string().trim().min(1, "Vendosni emailin e kontaktit.").email("Vendosni një adresë emaili të vlefshme."),
  phoneCountryCode: z.string().trim().regex(/^\+[1-9]\d{0,3}$/, "Përdorni prefiksin ndërkombëtar, p.sh. +355."),
  phoneNumber: z.string().trim().regex(/^[0-9 ()-]{5,20}$/, "Vendosni një numër telefoni të vlefshëm.").refine(value => value.replace(/\D/g, "").length >= 5, "Numri duhet të ketë të paktën 5 shifra."),
  includeAddress: z.boolean(),
  addressLine: z.string(),
  city: z.string(),
  postalCode: z.string(),
  countryCode: z.string(),
  acknowledged: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.includeAddress) {
    for (const [field, message] of [
      ["addressLine", "Vendosni adresën."],
      ["city", "Vendosni qytetin."],
      ["postalCode", "Vendosni kodin postar."],
    ] as const) {
      if (!data[field].trim()) ctx.addIssue({ code: "custom", path: [field], message });
    }
    if (!/^[A-Za-z]{2}$/.test(data.countryCode.trim())) ctx.addIssue({ code: "custom", path: ["countryCode"], message: "Vendosni kodin e shtetit me 2 shkronja, p.sh. AL." });
  }
  if (!data.acknowledged) ctx.addIssue({ code: "custom", path: ["acknowledged"], message: "Konfirmoni që e kuptoni se kjo është vetëm një provë." });
});
type FormValues = z.infer<typeof schema>;

const passengerLabel = (slot: KytePassengerSlot, index: number) => {
  const type = slot.type === "child" ? "Fëmijë" : slot.type === "infant" ? "Foshnjë" : "I rritur";
  return `Pasagjeri ${index + 1} · ${type}${slot.age === undefined ? "" : `, ${slot.age} vjeç`}`;
};
const formatExpiry = (value: string) => new Date(value).toLocaleString("sq-AL", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Tirane",
});
const formatPrice = (offer: KyteBookingOffer) => {
  const decimals = Math.max(0, Math.min(3, offer.currency.decimals));
  const value = offer.priceMinor / 10 ** decimals;
  try {
    return new Intl.NumberFormat("sq-AL", { style: "currency", currency: offer.currency.code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  } catch {
    return `${value.toFixed(decimals)} ${offer.currency.code}`;
  }
};

export default function KyteBookingForm({ offer, passengerSlots, isSubmitting, error, onCancel, onSubmit }: KyteBookingFormProps) {
  const instanceId = useId().replace(/:/g, "");
  const [now, setNow] = useState(Date.now());
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      passengers: passengerSlots.map(() => ({ firstName: "", lastName: "", title: undefined, gender: undefined, dateOfBirth: "" })),
      contactEmail: "", phoneCountryCode: "+355", phoneNumber: "",
      includeAddress: false, addressLine: "", city: "", postalCode: "", countryCode: "",
      acknowledged: false,
    },
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const expiryTime = offer.expiresAt ? new Date(offer.expiresAt).getTime() : NaN;
  const unknownExpiry = !Number.isFinite(expiryTime);
  const expired = !unknownExpiry && expiryTime <= now;
  const includeAddress = form.watch("includeAddress");
  const ready = !isSubmitting && !expired && !unknownExpiry && !!offer.bookingToken && passengerSlots.length > 0;

  const submit = (data: FormValues) => {
    if (!ready || expiryTime <= Date.now() || data.passengers.length !== passengerSlots.length) {
      setNow(Date.now());
      return;
    }
    const details: KyteBookingDetails = {
      passengers: data.passengers.map(passenger => ({
        firstName: passenger.firstName.trim(), lastName: passenger.lastName.trim(),
        title: passenger.title, gender: passenger.gender, dateOfBirth: passenger.dateOfBirth,
      })),
      contactEmail: data.contactEmail.trim(),
      phoneCountryCode: data.phoneCountryCode.trim(),
      phoneNumber: data.phoneNumber.trim(),
      ...(data.includeAddress ? { address: {
        addressLines: [data.addressLine.trim()], city: data.city.trim(),
        postalCode: data.postalCode.trim(), countryCode: data.countryCode.trim().toUpperCase(),
      } } : {}),
    };
    onSubmit(details);
  };

  return (
    <section className="kyte-booking" aria-labelledby={`${instanceId}-title`}>
      <header className="kb-head">
        <div className="kb-overline"><LockKeyhole size={15} aria-hidden="true" /> KINGS TRAVEL / KYTE SANDBOX</div>
        <h2 id={`${instanceId}-title`}>Rezervim provë</h2>
        <p>Kontrolloni ofertën dhe plotësoni të dhënat e pasagjerëve në rendin e kërkimit. Ky veprim i dërgohet mjedisit provë të furnitorit.</p>
      </header>

      <div className="kb-sandbox" role="note" data-testid="status-kyte-booking-sandbox">
        <ShieldAlert size={19} aria-hidden="true" />
        <div><strong>SANDBOX · Pa pagesë · Nuk lëshohet biletë reale</strong>Kjo është vetëm një provë e rrjedhës së rezervimit. Mos e trajtoni si rezervim apo biletë të vlefshme për udhëtim.</div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <div className="kb-layout">
            <div className="kb-main">
              <section className="kb-card kb-section" aria-labelledby={`${instanceId}-passengers-title`}>
                <div className="kb-section-top"><span className="kb-section-icon"><UserRound size={18} aria-hidden="true" /></span><div><h3 id={`${instanceId}-passengers-title`}>Të dhënat e pasagjerëve</h3><p>Emrat dhe datat e lindjes duhet të jenë të sakta për këtë provë.</p></div></div>
                {passengerSlots.map((slot, index) => {
                  const errors = form.formState.errors.passengers?.[index];
                  const prefix = `${instanceId}-passenger-${index}`;
                  return <div className="kb-passenger" key={slot.id} data-testid={`section-kyte-booking-passenger-${index}`}>
                    <div className="kb-passenger-head"><span className="kb-passenger-num">{String(index + 1).padStart(2, "0")}</span><strong>{passengerLabel(slot, index)}</strong></div>
                    <div className="kb-grid">
                      <div className="kb-field"><label htmlFor={`${prefix}-first`}>Emri *</label><input id={`${prefix}-first`} autoComplete="off" placeholder="Emri" maxLength={100} {...form.register(`passengers.${index}.firstName`)} aria-invalid={!!errors?.firstName} aria-describedby={errors?.firstName ? `${prefix}-first-error` : undefined} data-testid={`input-kyte-booking-first-name-${index}`} />{errors?.firstName && <p id={`${prefix}-first-error`} className="kb-error">{errors.firstName.message}</p>}</div>
                      <div className="kb-field"><label htmlFor={`${prefix}-last`}>Mbiemri *</label><input id={`${prefix}-last`} autoComplete="off" placeholder="Mbiemri" maxLength={100} {...form.register(`passengers.${index}.lastName`)} aria-invalid={!!errors?.lastName} aria-describedby={errors?.lastName ? `${prefix}-last-error` : undefined} data-testid={`input-kyte-booking-last-name-${index}`} />{errors?.lastName && <p id={`${prefix}-last-error`} className="kb-error">{errors.lastName.message}</p>}</div>
                    </div>
                    <div className="kb-grid kb-grid-three" style={{ marginTop: 16 }}>
                      <div className="kb-field"><label htmlFor={`${prefix}-title`}>Titulli *</label><select id={`${prefix}-title`} defaultValue="" {...form.register(`passengers.${index}.title`)} aria-invalid={!!errors?.title} aria-describedby={errors?.title ? `${prefix}-title-error` : undefined} data-testid={`select-kyte-booking-title-${index}`}><option value="" disabled>Zgjidhni</option><option value="MR">Z.</option><option value="MRS">Znj.</option><option value="MS">Znj. (Ms)</option><option value="MISS">Zonjushë</option><option value="MSTR">Djalë</option></select>{errors?.title && <p id={`${prefix}-title-error`} className="kb-error">{errors.title.message}</p>}</div>
                      <div className="kb-field"><label htmlFor={`${prefix}-gender`}>Gjinia *</label><select id={`${prefix}-gender`} defaultValue="" {...form.register(`passengers.${index}.gender`)} aria-invalid={!!errors?.gender} aria-describedby={errors?.gender ? `${prefix}-gender-error` : undefined} data-testid={`select-kyte-booking-gender-${index}`}><option value="" disabled>Zgjidhni</option><option value="MALE">Mashkull</option><option value="FEMALE">Femër</option></select>{errors?.gender && <p id={`${prefix}-gender-error`} className="kb-error">{errors.gender.message}</p>}</div>
                      <div className="kb-field"><label htmlFor={`${prefix}-dob`}>Datëlindja *</label><input id={`${prefix}-dob`} type="date" max={today()} {...form.register(`passengers.${index}.dateOfBirth`)} aria-invalid={!!errors?.dateOfBirth} aria-describedby={errors?.dateOfBirth ? `${prefix}-dob-error` : undefined} data-testid={`input-kyte-booking-dob-${index}`} />{errors?.dateOfBirth && <p id={`${prefix}-dob-error`} className="kb-error">{errors.dateOfBirth.message}</p>}</div>
                    </div>
                  </div>;
                })}
                {passengerSlots.length === 0 && <p className="kb-error" role="alert">Nuk ka pasagjerë në këtë kërkim. Kthehuni te kërkimi për të zgjedhur pasagjerët.</p>}
              </section>

              <section className="kb-card kb-section" aria-labelledby={`${instanceId}-contact-title`}>
                <div className="kb-section-top"><span className="kb-section-icon"><ContactRound size={18} aria-hidden="true" /></span><div><h3 id={`${instanceId}-contact-title`}>Kontakti kryesor</h3><p>Për njoftimet e provës nga furnitori; nuk përdoret për pagesë.</p></div></div>
                <div className="kb-grid">
                  <div className="kb-field kb-field-full"><label htmlFor={`${instanceId}-email`}>Email kontakti *</label><input id={`${instanceId}-email`} type="email" autoComplete="email" placeholder="emri@kompania.al" {...form.register("contactEmail")} aria-invalid={!!form.formState.errors.contactEmail} aria-describedby={form.formState.errors.contactEmail ? `${instanceId}-email-error` : undefined} data-testid="input-kyte-booking-email" />{form.formState.errors.contactEmail && <p id={`${instanceId}-email-error`} className="kb-error">{form.formState.errors.contactEmail.message}</p>}</div>
                  <div className="kb-field"><label htmlFor={`${instanceId}-dial`}>Prefiksi telefonik *</label><input id={`${instanceId}-dial`} type="tel" inputMode="tel" autoComplete="tel-country-code" placeholder="+355" {...form.register("phoneCountryCode")} aria-invalid={!!form.formState.errors.phoneCountryCode} aria-describedby={form.formState.errors.phoneCountryCode ? `${instanceId}-dial-error` : undefined} data-testid="input-kyte-booking-phone-code" />{form.formState.errors.phoneCountryCode && <p id={`${instanceId}-dial-error`} className="kb-error">{form.formState.errors.phoneCountryCode.message}</p>}</div>
                  <div className="kb-field"><label htmlFor={`${instanceId}-phone`}>Numri i telefonit *</label><input id={`${instanceId}-phone`} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="69 123 4567" {...form.register("phoneNumber")} aria-invalid={!!form.formState.errors.phoneNumber} aria-describedby={form.formState.errors.phoneNumber ? `${instanceId}-phone-error` : undefined} data-testid="input-kyte-booking-phone" />{form.formState.errors.phoneNumber && <p id={`${instanceId}-phone-error`} className="kb-error">{form.formState.errors.phoneNumber.message}</p>}</div>
                </div>
              </section>

              <section className="kb-card kb-section" aria-labelledby={`${instanceId}-address-title`}>
                <div className="kb-section-top"><span className="kb-section-icon"><ClipboardCheck size={18} aria-hidden="true" /></span><div><h3 id={`${instanceId}-address-title`}>Adresa</h3><p>Opsionale. Plotësojeni vetëm nëse kërkohet për rastin e provës.</p></div></div>
                <label className="kb-address-toggle"><input type="checkbox" {...form.register("includeAddress")} data-testid="checkbox-kyte-booking-address" /> Shto adresë kontakti</label>
                {includeAddress && <div className="kb-grid kb-address-fields">
                  <div className="kb-field kb-field-full"><label htmlFor={`${instanceId}-address`}>Rruga dhe numri *</label><input id={`${instanceId}-address`} autoComplete="street-address" {...form.register("addressLine")} aria-invalid={!!form.formState.errors.addressLine} aria-describedby={form.formState.errors.addressLine ? `${instanceId}-address-error` : undefined} data-testid="input-kyte-booking-address" />{form.formState.errors.addressLine && <p id={`${instanceId}-address-error`} className="kb-error">{form.formState.errors.addressLine.message}</p>}</div>
                  <div className="kb-field"><label htmlFor={`${instanceId}-city`}>Qyteti *</label><input id={`${instanceId}-city`} autoComplete="address-level2" {...form.register("city")} aria-invalid={!!form.formState.errors.city} aria-describedby={form.formState.errors.city ? `${instanceId}-city-error` : undefined} data-testid="input-kyte-booking-city" />{form.formState.errors.city && <p id={`${instanceId}-city-error`} className="kb-error">{form.formState.errors.city.message}</p>}</div>
                  <div className="kb-field"><label htmlFor={`${instanceId}-postal`}>Kodi postar *</label><input id={`${instanceId}-postal`} autoComplete="postal-code" {...form.register("postalCode")} aria-invalid={!!form.formState.errors.postalCode} aria-describedby={form.formState.errors.postalCode ? `${instanceId}-postal-error` : undefined} data-testid="input-kyte-booking-postal" />{form.formState.errors.postalCode && <p id={`${instanceId}-postal-error`} className="kb-error">{form.formState.errors.postalCode.message}</p>}</div>
                  <div className="kb-field"><label htmlFor={`${instanceId}-country`}>Kodi i shtetit (ISO 2) *</label><input id={`${instanceId}-country`} autoComplete="country" placeholder="AL" maxLength={2} {...form.register("countryCode")} aria-invalid={!!form.formState.errors.countryCode} aria-describedby={form.formState.errors.countryCode ? `${instanceId}-country-error` : undefined} data-testid="input-kyte-booking-country" />{form.formState.errors.countryCode && <p id={`${instanceId}-country-error`} className="kb-error">{form.formState.errors.countryCode.message}</p>}</div>
                </div>}
              </section>

              <div className="kb-card kb-footer">
                {error && <div className="kb-server-error" role="alert" data-testid="status-kyte-booking-error"><strong>Rezervimi provë nuk u përfundua.</strong>{error}</div>}
                <label className="kb-confirm"><input type="checkbox" {...form.register("acknowledged")} aria-invalid={!!form.formState.errors.acknowledged} aria-describedby={form.formState.errors.acknowledged ? `${instanceId}-ack-error` : undefined} data-testid="checkbox-kyte-booking-acknowledge" /><span>E kuptoj që ky është mjedis SANDBOX: nuk bëhet pagesë dhe nuk lëshohet biletë reale. Oferta duhet të jetë ende e vlefshme.</span></label>
                {form.formState.errors.acknowledged && <p id={`${instanceId}-ack-error`} className="kb-error kb-confirm-error">{form.formState.errors.acknowledged.message}</p>}
                <div className="kb-actions"><button type="button" className="kb-cancel" onClick={onCancel} disabled={isSubmitting} data-testid="button-kyte-booking-cancel">Anulo</button><button type="submit" className="kb-submit" disabled={!ready} data-testid="button-kyte-booking-submit">{isSubmitting ? "Duke dërguar provën…" : "Krijo rezervim provë pa pagesë"}<ArrowRight size={16} aria-hidden="true" /></button></div>
                <p className="kb-submit-note">Asnjë pagesë nuk kërkohet. Asnjë biletë reale nuk krijohet.</p>
              </div>
            </div>

            <aside className="kb-card kb-aside" aria-label="Përmbledhja dhe afati i ofertës">
              <div className="kb-aside-top"><div className="kb-aside-kicker">OFERTA NË KONTROLL</div><h3 data-testid="text-kyte-booking-airline">{offer.airline || "Linja ajrore"}</h3><div className="kb-price" data-testid="text-kyte-booking-price">{formatPrice(offer)}</div><p className="kb-hint">Çmim orientues; mund të ndryshojë para dërgimit.</p></div>
              <div className="kb-aside-journeys">{offer.journeys.map((journey, index) => {
                const first = journey.segments[0];
                const last = journey.segments[journey.segments.length - 1];
                return <div className="kb-route" key={index} data-testid={`text-kyte-booking-journey-${index}`}><div className="kb-route-label">{index === 0 ? "Nisja" : index === 1 ? "Kthimi" : `Itinerari ${index + 1}`}</div><div className="kb-route-line"><span>{first?.departure.airport || "—"}</span><Plane size={15} aria-hidden="true" /><span>{last?.arrival.airport || "—"}</span></div><p className="kb-route-note">{first?.departure.date || "Data e panjohur"} {first?.departure.time || ""} · {journey.segments.length === 1 ? "Direkt" : `${Math.max(0, journey.segments.length - 1)} ndalesa`}</p></div>;
              })}</div>
              <div className={`kb-expiry ${expired ? "is-expired" : unknownExpiry ? "is-unknown" : ""}`} role="status" data-testid="status-kyte-booking-expiry"><CalendarClock size={15} aria-hidden="true" />{expired ? "Oferta ka skaduar. Kthehuni te kërkimi për një ofertë të re." : unknownExpiry ? "Afati i ofertës nuk dihet. Për siguri, rezervimi provë është i çaktivizuar." : `Oferta vlen deri më ${formatExpiry(offer.expiresAt!)} (ora e Tiranës).`}</div>
              <p className="kb-privacy">Ky formular nuk i ruan të dhënat personale në localStorage. Mos ndani token-in e rezervimit.</p>
            </aside>
          </div>
        </form>
      </Form>
    </section>
  );
}