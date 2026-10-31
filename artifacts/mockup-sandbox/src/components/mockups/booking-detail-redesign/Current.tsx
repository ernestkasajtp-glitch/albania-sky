import './_group.css';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, Ticket, XCircle, Pencil, TrendingUp, History, Users, Globe, Plus,
} from "lucide-react";
import { mockBooking as booking, fmtM } from "./_mockData";

const statusColors: Record<string, string> = {
  confirmed: "bg-blue-500", ticketed: "bg-green-500",
  cancelled: "bg-red-500", draft: "bg-yellow-500", pending: "bg-orange-400",
};
const statusLabels: Record<string, string> = {
  draft: "DRAFT", pending: "PRITJE", confirmed: "KONFIRMUAR",
  ticketed: "BILETA", cancelled: "ANULUAR",
};

const fmtDate = (s: string) => {
  const d = new Date(s);
  const months = ["Jan","Shk","Mar","Pri","Maj","Qer","Kor","Gus","Sht","Tet","Nën","Dhj"];
  return `${d.getDate().toString().padStart(2,"0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
};
const fmtDateTime = (s: string) => `${fmtDate(s)} ${new Date(s).toTimeString().slice(0,5)}`;

export function Current() {
  const {
    bookingRef, status, pnr, source, createdAt, customerName, customerEmail, customerPhone,
    agentName, flight, totalAmount, paidAmount, dueAmount, creditAmount,
    netPrice, totalNetPrice, commissionAmount, passengers, extras, payments,
  } = booking;

  return (
    <div className="min-h-screen bg-background p-6 font-sans booking-detail-scope">
      <div className="space-y-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{bookingRef}</h1>
              <Badge className={`text-white ${statusColors[status]}`}>{statusLabels[status]}</Badge>
              {pnr && (
                <Badge variant="outline" className="font-mono text-sm font-bold tracking-wider border-primary/40 text-primary">
                  PNR: {pnr}
                </Badge>
              )}
              {source === "CitizenPlane" && (
                <Badge className="bg-sky-600 text-white px-1.5 py-1"><Globe className="h-3.5 w-3.5" /></Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">Krijuar {fmtDateTime(createdAt)}</p>
          </div>
          <div className="flex space-x-2 flex-wrap gap-y-2">
            <Button variant="outline" size="sm" className="text-gray-500"><History className="mr-1.5 h-3.5 w-3.5" /> Historiku</Button>
            <Button variant="outline" size="sm" className="text-purple-600 border-purple-300"><Users className="mr-1.5 h-3.5 w-3.5" /> CAKTO GRUPIN</Button>
            <Button variant="outline" className="text-red-500"><XCircle className="mr-2 h-4 w-4" /> Anulo</Button>
            <Button variant="outline" className="text-blue-500"><CheckCircle2 className="mr-2 h-4 w-4" /> Konfirmo</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white"><Ticket className="mr-2 h-4 w-4" /> Lësho Biletat</Button>
          </div>
        </div>

        {/* Customer + Flight */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Informacion Klienti</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2"><span className="text-muted-foreground">Emri:</span><span className="font-medium">{customerName}</span></div>
              <div className="grid grid-cols-2"><span className="text-muted-foreground">Email:</span><span>{customerEmail}</span></div>
              <div className="grid grid-cols-2"><span className="text-muted-foreground">Telefon:</span><span>{customerPhone}</span></div>
              <div className="grid grid-cols-2"><span className="text-muted-foreground">Agjencia:</span><span>{agentName}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Informacion Fluturimi</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2"><span className="text-muted-foreground">Fluturimi:</span><span className="font-medium">{flight.airline} {flight.flightNumber}</span></div>
              <div className="grid grid-cols-2"><span className="text-muted-foreground">Rruga:</span><span>{flight.fromCity} → {flight.toCity}</span></div>
              <div className="grid grid-cols-2"><span className="text-muted-foreground">Nisja:</span><span>{fmtDate(flight.departureDate)} {flight.departureTime}</span></div>
            </CardContent>
          </Card>
        </div>

        {/* PNR + Çmimet */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" /> PNR · Çmimet · Komisioni
            </CardTitle>
            <p className="text-xs text-muted-foreground">Kliko mbi fushën dhe ndrysho — ruhet automatikisht kur largohesh</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">PNR</label>
                <div className="flex border rounded-md overflow-hidden bg-muted/30">
                  <div className="px-3 py-2 text-sm font-mono font-semibold text-gray-800 w-full min-h-[38px] flex items-center">{pnr}</div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Auto nga PNR-të e pasagjerëve</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">Çmimi i Shitjes</label>
                <div className="flex border rounded-md overflow-hidden bg-white">
                  <span className="px-2 text-sm text-muted-foreground bg-muted/40 border-r flex items-center">€</span>
                  <input type="text" defaultValue={totalAmount.toFixed(2)} className="flex-1 px-2 py-2 text-sm bg-white focus:outline-none" />
                  <span className="px-2 flex items-center text-muted-foreground"><Pencil className="h-3 w-3 opacity-30" /></span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Çmimi total i faturës</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">Çmimi Neto (Blerja)</label>
                <div className="flex border rounded-md overflow-hidden bg-white">
                  <span className="px-2 text-sm text-muted-foreground bg-muted/40 border-r flex items-center">€</span>
                  <input type="text" defaultValue={netPrice!.toFixed(2)} className="flex-1 px-2 py-2 text-sm bg-white focus:outline-none" />
                  <span className="px-2 flex items-center text-muted-foreground"><Pencil className="h-3 w-3 opacity-30" /></span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Çmimi i blerjes nga linja</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">Komisioni (Fitimi)</label>
                <div>
                  <div className="font-bold text-2xl text-green-600">€{fmtM(commissionAmount)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">€{fmtM(totalAmount)} − €{fmtM(totalNetPrice)}</div>
                  <div className="text-[11px] text-green-600 font-medium">{((commissionAmount! / totalAmount) * 100).toFixed(1)}% marzh</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payments */}
        <Card>
          <CardHeader><CardTitle>Pagesat</CardTitle></CardHeader>
          <CardContent>
            <div className={`grid ${creditAmount > 0 ? "grid-cols-4" : "grid-cols-3"} text-center divide-x border rounded-md p-4 mb-6 bg-muted/20`}>
              <div><div className="text-sm text-muted-foreground">Shuma Totale</div><div className="text-2xl font-bold">€{fmtM(totalAmount)}</div></div>
              <div><div className="text-sm text-muted-foreground">Paguar (biletë)</div><div className="text-2xl font-bold text-green-600">€{fmtM(paidAmount)}</div></div>
              <div><div className="text-sm text-muted-foreground">Mbetet</div><div className={`text-2xl font-bold ${dueAmount > 0 ? "text-destructive" : "text-muted-foreground"}`}>€{fmtM(dueAmount)}</div></div>
            </div>
            <h3 className="font-medium mb-2">Historia e Pagesave</h3>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Data</TableHead><TableHead>Metoda</TableHead><TableHead>Referenca</TableHead><TableHead>Shuma</TableHead><TableHead>Statusi</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{fmtDateTime(p.createdAt)}</TableCell>
                    <TableCell><span className="font-medium text-sm">{p.method === "cash" ? "Para në dorë" : p.method === "bank_transfer" ? "Transfertë" : p.method}</span></TableCell>
                    <TableCell><div className="text-sm">{p.reference}</div>{p.notes && <div className="text-xs text-muted-foreground mt-0.5">{p.notes}</div>}</TableCell>
                    <TableCell className="font-semibold text-green-600">+€{fmtM(p.amount)}</TableCell>
                    <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Passengers */}
        <Card>
          <CardHeader><CardTitle>Pasagjerët ({passengers.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Emri</TableHead><TableHead>Tipi</TableHead><TableHead>Çmimi Biletës</TableHead><TableHead>Ulëse</TableHead>
                  <TableHead>Pasaporta</TableHead><TableHead>Shtetësia</TableHead><TableHead>Datëlindja</TableHead><TableHead>Shtesa</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passengers.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.firstName} {p.lastName}</TableCell>
                    <TableCell className="capitalize">{p.type === "adult" ? "I rritur" : p.type === "child" ? "Fëmijë" : "Foshnjë"}</TableCell>
                    <TableCell><span className="font-medium">€{fmtM(p.ticketPrice)}</span></TableCell>
                    <TableCell>{p.seatNumber || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell>{p.passportNumber}</TableCell>
                    <TableCell>{p.nationality}</TableCell>
                    <TableCell><span className="text-sm font-medium">{p.dateOfBirth.split("-").reverse().join("/")}</span></TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {p.baggageOption === "checked" && <Badge variant="secondary" className="text-xs">Bagazh 20 KG</Badge>}
                        {p.hasSeatSelection && <Badge variant="secondary" className="text-xs">Ulëse</Badge>}
                        {p.hasPriorityBoarding && <Badge variant="secondary" className="text-xs">Prioritet</Badge>}
                        {p.hasInsurance && <Badge variant="secondary" className="text-xs">Sigurim</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><Button size="sm" variant="ghost"><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Excel-like panel */}
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/40 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-700 text-white">
                <span className="text-xs font-semibold tracking-wide">Kopjo për Excel · {passengers.length} pasagjerë</span>
                <div className="flex gap-2">
                  <button className="px-2.5 py-1 rounded text-xs font-medium bg-green-600 text-white">Kopjo për WhatsApp</button>
                  <button className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 text-white">Kopjo</button>
                </div>
              </div>
              <div className="overflow-x-auto px-4 py-3">
                <table className="border-collapse text-xs font-mono w-full">
                  <thead>
                    <tr className="bg-emerald-600 text-white">
                      {["PASSANGER","EXTRA","CONFIRMED","-1 SHITUR","OPERATORI","SHENIME","NISJA","ORA","DEST","STATUS"].map(h => (
                        <th key={h} className="px-2 py-1.5 text-left font-bold border border-emerald-500 text-[11px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {passengers.map((p: any, i: number) => (
                      <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-emerald-50/50"}>
                        <td className="px-2 py-1.5 border border-gray-200 text-[12px]">{p.firstName} {p.lastName}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-[12px] text-blue-700 font-semibold">{p.type === "infant" ? "INF" : p.baggageOption === "checked" ? "20 KG" : ""}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-[12px] text-orange-600 font-bold">WAITING</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-[12px]">{p.ticketPrice} €</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-[12px]">NESTI TRAVEL</td>
                        <td className="px-1 py-0.5 border border-gray-200 bg-yellow-50">
                          <input defaultValue={p.pnr} className="w-full px-1.5 py-1 bg-transparent font-mono text-[12px] text-center font-semibold" />
                        </td>
                        <td className="px-2 py-1.5 border border-gray-200 text-[12px]">18.6.2026</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-[12px]">14:25</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-[12px]">TIA-FCO</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-[12px] text-orange-600 font-bold">WAITING</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Extras */}
            <div className="mt-6 border-t pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Shtojca Pasagjerëve</h3>
                <span className="text-sm font-medium text-primary">Total: €{fmtM(extras.reduce((s: number, e: any)=>s+e.amount,0))}</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {["Bagazh","Ulëse","Prioritet","Sigurim","Tjetër"].map(opt => (
                  <button key={opt} className="px-3 py-1.5 rounded-full text-sm font-medium border bg-white text-foreground border-input hover:border-primary hover:text-primary">+ {opt}</button>
                ))}
              </div>
              <div className="space-y-1.5">
                {extras.map((ex: any) => (
                  <div key={ex.id} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/30">
                    <span className="text-sm">{ex.description}</span>
                    <span className="text-sm font-semibold">€{fmtM(ex.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
