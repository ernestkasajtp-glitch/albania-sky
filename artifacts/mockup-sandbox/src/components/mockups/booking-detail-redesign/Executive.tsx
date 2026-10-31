import React from "react";
import { mockBooking as booking, fmtM } from "./_mockData";
import "./_group.css";
import {
  PlaneTakeoff,
  User,
  Mail,
  Phone,
  Building,
  History,
  Users,
  XCircle,
  Copy,
  Plus,
  Briefcase,
  Shield,
  Pencil,
  MoreVertical,
  Send,
} from "lucide-react";

export function Executive() {
  const paxCount = booking.passengers.length;

  const totalExtras = booking.extras.reduce((sum: number, e: any) => sum + e.amount, 0);
  
  const marginPercentage = ((booking.commissionAmount / booking.totalAmount) * 100).toFixed(1);

  return (
    <div className="booking-detail-scope min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-slate-200 pb-24">
      {/* Dark Executive Hero */}
      <div className="relative pt-12 pb-24 px-8 overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 z-0">
          <img
            src="/__mockup/images/bd-luxury-deck.png"
            alt="Luxury"
            className="w-full h-full object-cover opacity-30 mix-blend-luminosity grayscale"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 to-slate-950/100" />
        </div>

        <div className="relative z-10 max-w-[1400px] mx-auto">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                <Briefcase className="w-5 h-5 text-slate-300" />
              </div>
              <div>
                <div className="text-slate-400 text-xs tracking-widest uppercase font-semibold mb-1">
                  Deal Reference
                </div>
                <div className="font-mono text-xl text-white tracking-tight">
                  {booking.bookingRef}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <div className="text-slate-400 text-xs tracking-widest uppercase font-semibold mb-1">
                  Status
                </div>
                <div className="flex items-center gap-2 text-emerald-400 font-medium uppercase tracking-wider text-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  {booking.status}
                </div>
              </div>
              <div className="h-10 w-px bg-slate-800" />
              <div className="flex flex-col items-end">
                <div className="text-slate-400 text-xs tracking-widest uppercase font-semibold mb-1">
                  PNR
                </div>
                <div className="font-mono text-xl text-white tracking-tight bg-slate-800/50 px-3 py-1 rounded border border-slate-700">
                  {booking.pnr}
                </div>
              </div>
            </div>
          </div>

          {/* CFO Dashboard P&L */}
          <div className="grid grid-cols-4 gap-8">
            <div className="space-y-2">
              <div className="text-slate-400 text-sm font-medium">Shitje (Revenue)</div>
              <div className="font-display text-5xl font-light tracking-tight text-white flex items-baseline gap-1">
                <span className="text-2xl text-slate-500 font-sans">€</span>
                {fmtM(booking.totalAmount)}
              </div>
            </div>
            
            <div className="space-y-2 relative">
              <div className="absolute left-0 top-2 bottom-2 w-px bg-slate-800 -ml-4" />
              <div className="text-slate-400 text-sm font-medium">Neto (Cost)</div>
              <div className="font-display text-5xl font-light tracking-tight text-slate-300 flex items-baseline gap-1">
                <span className="text-2xl text-slate-600 font-sans">€</span>
                {fmtM(booking.netPrice)}
              </div>
            </div>

            <div className="space-y-2 relative">
              <div className="absolute left-0 top-2 bottom-2 w-px bg-slate-800 -ml-4" />
              <div className="text-slate-400 text-sm font-medium">Komisioni (Margin)</div>
              <div className="flex items-end gap-4">
                <div className="font-display text-5xl font-light tracking-tight text-emerald-400 flex items-baseline gap-1">
                  <span className="text-2xl text-emerald-600/50 font-sans">€</span>
                  {fmtM(booking.commissionAmount)}
                </div>
                <div className="mb-2 px-2 py-1 rounded bg-emerald-400/10 text-emerald-400 text-sm font-mono border border-emerald-400/20">
                  {marginPercentage}%
                </div>
              </div>
            </div>

            <div className="space-y-2 relative">
              <div className="absolute left-0 top-2 bottom-2 w-px bg-slate-800 -ml-4" />
              <div className="text-slate-400 text-sm font-medium">Payment Progress</div>
              <div className="pt-2">
                <div className="flex justify-between text-sm mb-2 font-mono">
                  <span className="text-slate-300">Paid: €{fmtM(booking.paidAmount)}</span>
                  <span className="text-rose-400">Due: €{fmtM(booking.dueAmount)}</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                  <div 
                    className="h-full bg-slate-300 rounded-l-full" 
                    style={{ width: `${(booking.paidAmount / booking.totalAmount) * 100}%` }} 
                  />
                  <div className="h-full bg-rose-500 flex-1" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Briefing Layout */}
      <div className="max-w-[1400px] mx-auto px-8 -mt-10 relative z-20 grid grid-cols-12 gap-8">
        
        {/* Left Column: Deal Facts & Actions (4 cols) */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          
          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 flex flex-col gap-2">
             <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                <Send className="w-4 h-4" />
                Lësho Biletat
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm">
                  Konfirmo
                </button>
                <button className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm">
                  Anulo
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                  <Users className="w-4 h-4" />
                  Cakto Grupin
                </button>
                <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                  <History className="w-4 h-4" />
                  Historiku
                </button>
              </div>
          </div>

          {/* Flight Facts */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-6 flex items-center gap-2">
              <PlaneTakeoff className="w-4 h-4" /> Routing
            </h3>
            
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  <img src="https://www.wizzair.com/static/favicons/favicon-32x32.png" alt="W6" className="w-6 h-6 rounded bg-fuchsia-900 p-1" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{booking.flight.airline} {booking.flight.flightNumber}</div>
                  <div className="text-sm text-slate-500">{booking.flight.departureDate} · {booking.flight.departureTime}</div>
                </div>
              </div>

              <div className="relative pl-3">
                <div className="absolute left-[3px] top-2 bottom-2 w-0.5 bg-slate-200" />
                <div className="relative space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-slate-900 -ml-[19px] ring-4 ring-white" />
                    <div className="font-medium text-slate-900">{booking.flight.fromCity}</div>
                    <div className="text-slate-400 text-sm font-mono">{booking.flight.fromAirport}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-slate-900 -ml-[19px] ring-4 ring-white" />
                    <div className="font-medium text-slate-900">{booking.flight.toCity}</div>
                    <div className="text-slate-400 text-sm font-mono">{booking.flight.toAirport}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Client Facts */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-6 flex items-center gap-2">
              <User className="w-4 h-4" /> Client Details
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                    <img src="/__mockup/images/bd-avatar-arben.png" alt={booking.customerName} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">{booking.customerName}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Building className="w-3 h-3" /> {booking.agentName}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">{booking.customerEmail}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">{booking.customerPhone}</span>
                </div>
              </div>
            </div>
          </div>

          {/* WhatsApp / Excel Copy Panel */}
          <div className="bg-[#111B21] rounded-xl shadow-sm border border-slate-800 p-5 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="p-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-md shadow flex items-center gap-2 text-xs font-medium transition-colors">
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <h3 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-4 flex items-center gap-2">
               Portal Paste Data
            </h3>
            <div className="font-mono text-xs text-emerald-400/80 leading-relaxed whitespace-pre-wrap selection:bg-emerald-900 selection:text-emerald-100">
              {booking.passengers.map((p: any, i: number) => (
                <div key={i} className="hover:bg-slate-800/50 px-1 -mx-1 rounded py-0.5">
                  {p.lastName}/{p.firstName} {p.type.toUpperCase()} {p.passportNumber || 'NO_DOC'} {p.dateOfBirth || 'NO_DOB'}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Passenger Ledger & Payments (8 cols) */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          
          {/* Passenger Ledger */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-medium text-slate-900 flex items-center gap-2">
                Passenger Ledger <span className="text-slate-400 font-normal">({paxCount} total)</span>
              </h3>
              <button className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-md border border-indigo-100">
                <Plus className="w-4 h-4" /> Shto Pasagjer
              </button>
            </div>
            
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Docs</th>
                  <th className="px-6 py-3">Price</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {booking.passengers.map((pax: any) => (
                  <tr key={pax.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{pax.firstName} {pax.lastName}</div>
                      {pax.seatNumber && (
                         <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                           Seat <span className="font-mono text-slate-700 bg-slate-100 px-1 rounded border border-slate-200">{pax.seatNumber}</span>
                         </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                        {pax.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {pax.passportNumber ? (
                        <div className="text-xs font-mono text-slate-600">{pax.passportNumber}</div>
                      ) : (
                        <span className="text-xs text-rose-500 font-medium">Missing</span>
                      )}
                      {pax.dateOfBirth && <div className="text-xs text-slate-400 mt-1">{pax.dateOfBirth}</div>}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-900 group-hover:bg-white group-hover:shadow-sm group-hover:ring-1 group-hover:ring-slate-200 rounded transition-all cursor-text relative">
                       <span className="text-slate-400 mr-1">€</span>{fmtM(pax.ticketPrice)}
                       <Pencil className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 opacity-0 group-hover:opacity-100" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Extras / Shtojca */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
             <div className="flex items-center justify-between mb-6">
                <h3 className="font-medium text-slate-900 flex items-center gap-2">
                  Ancillary Services
                </h3>
                <div className="font-mono font-medium text-slate-900 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
                  Total: €{fmtM(totalExtras)}
                </div>
             </div>

             <div className="flex flex-wrap gap-2 mb-6">
               {['+ Bagazh', '+ Ulëse', '+ Prioritet', '+ Sigurim', '+ Tjetër'].map((item) => (
                 <button key={item} className="text-sm px-4 py-2 rounded border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 transition-colors font-medium shadow-sm">
                   {item}
                 </button>
               ))}
             </div>

             <div className="space-y-3">
               {booking.extras.map((extra: any) => (
                 <div key={extra.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-sm hover:border-slate-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm">
                         {extra.description.toLowerCase().includes('bagazh') && <Briefcase className="w-5 h-5" />}
                         {extra.description.toLowerCase().includes('sigurim') && <Shield className="w-5 h-5" />}
                         {extra.description.toLowerCase().includes('prioritet') && <Users className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">{extra.description}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Added to booking</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="font-mono text-sm text-slate-900 bg-white px-2 py-1 rounded border border-slate-100">€{fmtM(extra.amount)}</div>
                      <button className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded transition-colors">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                 </div>
               ))}
             </div>
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
              <h3 className="font-medium text-slate-900">Payment History</h3>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3">Reference</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {booking.payments.map((payment: any) => (
                  <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">{new Date(payment.createdAt).toLocaleString('sq-AL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wider">
                        {payment.method.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{payment.reference}</td>
                    <td className="px-6 py-4 text-right font-mono font-medium text-slate-900">
                      €{fmtM(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}
