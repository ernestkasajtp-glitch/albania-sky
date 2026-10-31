// Presentation-only messages: never display arbitrary API error bodies to customers.
// Keep these separate from the page translation catalogue (whose keys are Albanian UI text).
export type ErrorLanguage = "en" | "sq";
export type ErrorContext = "general" | "booking" | "payment";

const messages = {
  en: {
    network: "We couldn't connect. Please check your connection and try again.",
    general: "We couldn't complete your request. Please try again later.",
    booking: "We couldn't confirm your booking. Check My Bookings before trying again; if you need help, contact support.",
    payment: "We couldn't confirm the payment status. Check your booking and payment status before taking any further action, or contact support.",
    session: "Your session has expired. Please sign in again.",
    forbidden: "You don't have permission to access this booking.",
    notFound: "The requested information could not be found.",
    invalid: "Please check the details you entered and try again.",
    busy: "The service is temporarily unavailable. Please try again later.",
    rateLimit: "Too many attempts. Please wait a while before trying again.",
    invalidId: "This link is invalid. Please check it and try again.",
    flightMissing: "This flight could not be found. Please search for another flight.",
    flightUnavailable: "This flight is no longer available. Please choose another flight.",
    seats: "There aren't enough seats available on this flight. Please select fewer passengers or another flight.",
    salesClosed: "Ticket sales for this flight have closed. Please choose another flight.",
    gender: "Please select a gender (M/F) for every passenger.",
    requiredBooking: "Please enter the flight, customer name and passenger details.",
    emailRegistered: "This email is already registered. Please sign in or use another email.",
    registerRequired: "Please enter your name, email and password.",
    loginRequired: "Please enter your email and password.",
    credentials: "Email or password is incorrect. Please try again.",
    agentInfo: "Agents must enter their company and tax ID. Please check the contact details.",
    bookingMissing: "This booking could not be found. Please check its reference.",
    paid: "This booking is already paid. Check its payment details before taking further action.",
    cancelled: "This booking has been cancelled. Payment cannot be started.",
    paymentUnavailable: "Card payment is currently unavailable. Your booking has not been cancelled. Check its status before taking further action.",
    paymentMismatch: "This payment order doesn't match the booking. Check the booking and contact support.",
    paymentOrderRequired: "The payment order ID is missing. Check the booking's payment status or contact support.",
    pdf: "We couldn't download the PDF right now. Please try again later.",
  },
  sq: {
    network: "Nuk u lidhëm me shërbimin. Kontrolloni lidhjen tuaj dhe provoni përsëri.",
    general: "Nuk e përfunduam dot kërkesën. Ju lutemi provoni përsëri më vonë.",
    booking: "Nuk konfirmuam dot rezervimin. Kontrolloni Rezervimet e Mia para se të provoni sërish; nëse keni nevojë, kontaktoni mbështetjen.",
    payment: "Nuk konfirmuam dot gjendjen e pagesës. Kontrolloni rezervimin dhe pagesën para çdo veprimi tjetër, ose kontaktoni mbështetjen.",
    session: "Sesioni juaj ka përfunduar. Ju lutemi hyni përsëri.",
    forbidden: "Nuk keni leje për të parë këtë rezervim.",
    notFound: "Informacioni i kërkuar nuk u gjet.",
    invalid: "Kontrolloni të dhënat e futura dhe provoni përsëri.",
    busy: "Shërbimi nuk është përkohësisht i disponueshëm. Provoni përsëri më vonë.",
    rateLimit: "Shumë tentativa. Prisni pak para se të provoni përsëri.",
    invalidId: "Kjo lidhje nuk është e vlefshme. Kontrollojeni dhe provoni përsëri.",
    flightMissing: "Ky fluturim nuk u gjet. Kërkoni një fluturim tjetër.",
    flightUnavailable: "Ky fluturim nuk është më i disponueshëm. Zgjidhni një fluturim tjetër.",
    seats: "Nuk ka vende të mjaftueshme në këtë fluturim. Zgjidhni më pak pasagjerë ose një fluturim tjetër.",
    salesClosed: "Shitja e biletave për këtë fluturim ka përfunduar. Zgjidhni një fluturim tjetër.",
    gender: "Zgjidhni gjininë (M/F) për çdo pasagjer.",
    requiredBooking: "Plotësoni fluturimin, emrin e klientit dhe të dhënat e pasagjerëve.",
    emailRegistered: "Ky email është regjistruar tashmë. Hyni ose përdorni një email tjetër.",
    registerRequired: "Plotësoni emrin, email-in dhe fjalëkalimin.",
    loginRequired: "Plotësoni email-in dhe fjalëkalimin.",
    credentials: "Email-i ose fjalëkalimi është i pasaktë. Provoni përsëri.",
    agentInfo: "Agjentët duhet të plotësojnë kompaninë dhe NIPT-in. Kontrolloni të dhënat e kontaktit.",
    bookingMissing: "Ky rezervim nuk u gjet. Kontrolloni referencën e tij.",
    paid: "Ky rezervim është paguar tashmë. Kontrolloni pagesën para çdo veprimi tjetër.",
    cancelled: "Ky rezervim është anuluar. Pagesa nuk mund të niset.",
    paymentUnavailable: "Pagesa me kartë nuk është e disponueshme tani. Rezervimi juaj nuk është anuluar. Kontrolloni gjendjen para çdo veprimi tjetër.",
    paymentMismatch: "Kjo porosi pagese nuk përputhet me rezervimin. Kontrolloni rezervimin dhe kontaktoni mbështetjen.",
    paymentOrderRequired: "Mungon ID-ja e porosisë së pagesës. Kontrolloni gjendjen e pagesës ose kontaktoni mbështetjen.",
    pdf: "Nuk shkarkuam dot PDF-në tani. Provoni përsëri më vonë.",
  },
} as const;

type MessageKey = keyof typeof messages.en;
const knownErrors: Record<string, MessageKey> = {
  "Invalid id": "invalidId",
  "Flight not found": "flightMissing",
  "Flight not available": "flightUnavailable",
  "Not enough seats available": "seats",
  "Shitja e biletave për këtë fluturim ka përfunduar.": "salesClosed",
  "Gjinia (M/F) është e detyrueshme për të gjithë pasagjerët": "gender",
  "flightId, customerName, passengers required": "requiredBooking",
  "email, password, name are required": "registerRequired",
  "email and password are required": "loginRequired",
  "Invalid credentials": "credentials",
  "Email already registered": "emailRegistered",
  "Agjentët duhet të plotësojnë kompaninë/NIPT; të dhënat e kontaktit duhet të jenë tekst.": "agentInfo",
  "Booking not found": "bookingMissing",
  "Booking is already paid": "paid",
  "Pagesa është kryer tashmë për këtë rezervim.": "paid",
  "Booking is cancelled": "cancelled",
  "POK Pay nuk është konfiguruar": "paymentUnavailable",
  "POK refuzoi validimin ose autentikimin; porosia nuk u krijua.": "paymentUnavailable",
  "Missing orderId": "paymentOrderRequired",
  "Order does not match booking": "paymentMismatch",
  "PDF generation failed": "pdf",
};

export function errorLanguage(language: string | undefined): ErrorLanguage {
  return language?.toLowerCase().startsWith("en") ? "en" : "sq";
}

export function safeApiErrorMessage(
  status: number | undefined,
  raw: unknown,
  language: ErrorLanguage,
  context: ErrorContext = "general",
): string {
  const text = messages[language];
  // A status must take priority over the body: a server error must never leak
  // an internal/SQL message, even if it resembles an ordinary validation error.
  if (status === 401 && raw !== "Invalid credentials") return text.session;
  if (status === 403) return text.forbidden;
  if (status === 429) return text.rateLimit;
  if (status !== undefined && status >= 500) return text[context === "general" ? "busy" : context];
  if (typeof raw === "string" && status !== undefined && status >= 400 && status < 500) {
    if (raw === "Invalid credentials" && status === 401) return text.credentials;
    const key = knownErrors[raw];
    if (key) return text[key];
    if (status === 404) return text.notFound;
    if (status === 400 && /^Shumë tentativa të gabuara\. Provo përsëri pas \d+ minutash\.$/.test(raw)) return text.rateLimit;
  }
  if (status === undefined) return context === "general" ? text.network : text[context];
  if (context !== "general") return text[context];
  if (status < 400) return text.general;
  if (status === 404) return text.notFound;
  if (status === 400 || status === 422) return text.invalid;
  return text.general;
}