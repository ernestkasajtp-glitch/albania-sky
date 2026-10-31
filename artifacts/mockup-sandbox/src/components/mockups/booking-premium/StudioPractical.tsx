import './_group.css';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Plane, Search, CalendarDays, ChevronDown, ChevronRight, Check, Users, User,
  Baby, Plus, Trash2, BriefcaseBusiness, ShieldCheck, Armchair, Zap,
  Building2, FileText, Receipt, BadgePercent, Phone, Mail, NotebookPen,
  Clock3, CircleAlert, X, ArrowRight, Save, Menu, LockKeyhole,
} from 'lucide-react';

type Flight = {
  id: number; airline: string; flightNumber: string; fromCity: string; fromAirport: string;
  toCity: string; toAirport: string; departureDate: string; departureTime: string;
  arrivalTime: string; adultPrice: number; childPrice: number; infantPrice: number;
  tax: number; availableSeats: number; isConfirmed: boolean;
  checkedBaggagePrice: number; seatSelectionPrice: number; priorityBoardingPrice: number; insurancePrice: number;
};
type Passenger = {
  id: string; type: 'adult' | 'child' | 'infant'; firstName: string; lastName: string;
  dateOfBirth: string; baggageOption: string; hasSeatSelection: boolean; hasPriorityBoarding: boolean;
  hasInsurance: boolean; ticketPrice: string;
};

const flights: Flight[] = [
  { id: 1, airline: 'WIZZ AIR', flightNumber: 'W44799', fromCity: 'Tiranë', fromAirport: 'TIA', toCity: 'Bologna', toAirport: 'BLQ', departureDate: '2026-03-14', departureTime: '19:05', arrivalTime: '20:55', adultPrice: 140, childPrice: 120, infantPrice: 45, tax: 30, availableSeats: 30, isConfirmed: true, checkedBaggagePrice: 35, seatSelectionPrice: 12, priorityBoardingPrice: 8, insurancePrice: 15 },
  { id: 2, airline: 'WIZZ AIR', flightNumber: 'W44801', fromCity: 'Tiranë', fromAirport: 'TIA', toCity: 'Milano', toAirport: 'MXP', departureDate: '2026-03-14', departureTime: '06:40', arrivalTime: '08:30', adultPrice: 165, childPrice: 140, infantPrice: 50, tax: 30, availableSeats: 7, isConfirmed: false, checkedBaggagePrice: 35, seatSelectionPrice: 12, priorityBoardingPrice: 8, insurancePrice: 15 },
  { id: 3, airline: 'WIZZ AIR', flightNumber: 'W44815', fromCity: 'Tiranë', fromAirport: 'TIA', toCity: 'Romë', toAirport: 'FCO', departureDate: '2026-03-14', departureTime: '13:20', arrivalTime: '15:05', adultPrice: 155, childPrice: 130, infantPrice: 48, tax: 30, availableSeats: 42, isConfirmed: false, checkedBaggagePrice: 35, seatSelectionPrice: 12, priorityBoardingPrice: 8, insurancePrice: 15 },
];
const agents = [
  { id: 1, name: 'Elira Hoxha', company: 'Z TRAVEL', commission: 5 },
  { id: 2, name: 'Ardit Meta', company: 'SKY LINE', commission: 3 },
];
const initialPassengers: Passenger[] = [
  { id: 'p1', type: 'adult', firstName: 'Melissa', lastName: 'Shuli', dateOfBirth: '', baggageOption: 'checked', hasSeatSelection: true, hasPriorityBoarding: false, hasInsurance: false, ticketPrice: '170' },
  { id: 'p2', type: 'adult', firstName: 'Genti', lastName: 'Shuli', dateOfBirth: '', baggageOption: '', hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false, ticketPrice: '170' },
];
const typeLabels = { adult: 'I rritur', child: 'Fëmijë', infant: 'Foshnje' };
const num = 'num text-[#27313a]';

function money(value: number) { return `€${Math.round(value)}`; }
function IconBox({ children, tone = 'navy' }: { children: React.ReactNode; tone?: 'navy' | 'teal' | 'sand' }) {
  return <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone === 'teal' ? 'bg-[#dfeeea] text-[#176d67]' : tone === 'sand' ? 'bg-[#f0eadc] text-[#8b682d]' : 'bg-[#e5ebf0] text-[#30485d')}>{children}</div>;
}
function Field({ label, value, onChange, icon: Icon, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; icon?: typeof User; type?: string; placeholder?: string }) {
  return <label className="block">
    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.12em] text-[#71808b]">{label}</span>
    <span className="relative block">
      {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8997a0]" />}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cn('h-10 w-full rounded-md border border-[#d8e0e4] bg-[#fbfcfc] px-3 text-[13px] text-[#27313a] outline-none transition focus:border-[#487d7a] focus:bg-white focus:ring-2 focus:ring-[#487d7a]/10', Icon && 'pl-9')} />
    </span>
  </label>;
}
function Section({ icon, title, subtitle, children, action }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="overflow-hidden rounded-lg border border-[#d8e0e4] bg-[#fffefa] shadow-[0_1px_2px_rgba(37,54,64,.03)]">
    <header className="flex items-center justify-between border-b border-[#e5eaec] px-5 py-4">
      <div className="flex items-center gap-3"><IconBox>{icon}</IconBox><div><h2 className="text-[14px] font-bold text-[#263943]">{title}</h2>{subtitle && <p className="mt-0.5 text-[11px] text-[#7a8991]">{subtitle}</p>}</div></div>
      {action}
    </header>
    {children}
  </section>;
}
function Toggle({ checked, onClick, label, icon: Icon, price }: { checked: boolean; onClick: () => void; label: string; icon: typeof BriefcaseBusiness; price: number }) {
  return <button type="button" onClick={onClick} className={cn('flex min-h-[52px] items-center gap-2 rounded-md border px-2.5 text-left transition hover:border-[#7f9d9a]', checked ? 'border-[#6f9b94] bg-[#edf5f2]' : 'border-[#e1e6e8] bg-white')}>
    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', checked ? 'bg-[#d3e8e2] text-[#176d67]' : 'bg-[#f0f3f4] text-[#7c8b93]')}><Icon className="h-3.5 w-3.5" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-[#3c4e56]">{label}</span><span className={cn('mt-0.5 block text-[10px]', num)}>{money(price)}</span></span>
    <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', checked ? 'border-[#176d67] bg-[#176d67] text-white' : 'border-[#bdc8cc]')}>{checked && <Check className="h-2.5 w-2.5" />}</span>
  </button>;
}

export function StudioPractical() {
  const [from, setFrom] = useState('Tiranë');
  const [to, setTo] = useState('Bologna');
  const [date, setDate] = useState('2026-03-14');
  const [selectedId, setSelectedId] = useState(1);
  const [passengers, setPassengers] = useState(initialPassengers);
  const [expanded, setExpanded] = useState(0);
  const [agentId, setAgentId] = useState<number | null>(1);
  const [agentOpen, setAgentOpen] = useState(false);
  const [customer, setCustomer] = useState('melissa shuli');
  const [email, setEmail] = useState('melissa.shuli@example.com');
  const [phone, setPhone] = useState('+355 69 000 0000');
  const [commission, setCommission] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [markup, setMarkup] = useState('0');
  const [saved, setSaved] = useState(false);
  const selected = flights.find(f => f.id === selectedId) ?? flights[0];
  const filtered = flights.filter(f => (!from || f.fromCity.toLowerCase().includes(from.toLowerCase()) || f.fromAirport.toLowerCase().includes(from.toLowerCase())) && (!to || f.toCity.toLowerCase().includes(to.toLowerCase()) || f.toAirport.toLowerCase().includes(to.toLowerCase())) && (!date || f.departureDate === date));
  const totals = useMemo(() => {
    const ticket = passengers.reduce((sum, p) => sum + Number(p.ticketPrice || (p.type === 'adult' ? selected.adultPrice : p.type === 'child' ? selected.childPrice : selected.infantPrice)), 0);
    const extras = passengers.reduce((sum, p) => sum + (p.baggageOption === 'checked' ? selected.checkedBaggagePrice : 0) + (p.hasSeatSelection ? selected.seatSelectionPrice : 0) + (p.hasPriorityBoarding ? selected.priorityBoardingPrice : 0) + (p.hasInsurance ? selected.insurancePrice : 0), 0);
    const tax = selected.tax * passengers.length;
    const total = ticket + extras + tax + Number(markup || 0) * passengers.length - Number(discount || 0);
    return { ticket, extras, tax, total: Math.max(0, total) };
  }, [passengers, selected, markup, discount]);
  const updatePassenger = (index: number, patch: Partial<Passenger>) => setPassengers(prev => prev.map((p, i) => i === index ? { ...p, ...patch } : p));
  const addPassenger = (type: Passenger['type']) => { setPassengers(prev => [...prev, { id: `p${Date.now()}`, type, firstName: '', lastName: '', dateOfBirth: '', baggageOption: '', hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false, ticketPrice: '' }]); setExpanded(passengers.length); };
  const removePassenger = (index: number) => setPassengers(prev => prev.filter((_, i) => i !== index));

  return <div className="booking-premium-scope min-h-[100dvh] bg-[#f2f5f4] font-sans text-[#263943]">
    <form onSubmit={e => { e.preventDefault(); setSaved(true); setTimeout(() => setSaved(false), 2400); }}>
      <div className="sticky top-0 z-30 border-b border-[#d6dfe1] bg-[#fbfcfb]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#29485b] text-[#f4ead3]"><Plane className="h-4 w-4 -rotate-45" /></div><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#7b8b92]">Kings Travel</div><div className="text-[15px] font-bold tracking-tight text-[#263943]">Rezervim i ri</div></div></div>
          <div className="hidden items-center gap-2 text-[11px] text-[#7b8b92] md:flex"><span>Operacionet</span><ChevronRight className="h-3 w-3" /><span>Rezervimet</span><ChevronRight className="h-3 w-3" /><strong className="text-[#334a55]">Krijo</strong></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => setSaved(false)} className="hidden h-9 items-center gap-2 rounded-md px-3 text-[12px] font-semibold text-[#60717a] transition hover:bg-[#edf1f1] sm:flex"><X className="h-3.5 w-3.5" /> Anulo</button><button type="submit" className="flex h-9 items-center gap-2 rounded-md bg-[#29485b] px-3.5 text-[12px] font-semibold text-white transition hover:bg-[#1f3b4b]"><Save className="h-3.5 w-3.5" /> {saved ? 'U ruajt' : 'Krijo rezervimin'}</button></div>
        </div>
        <div className="border-t border-[#e8edef] bg-[#f7f9f8]"><div className="mx-auto flex max-w-[1240px] items-center px-4 md:px-8"><Step n="1" label="Fluturimi" done /><StepLine /><Step n="2" label="Pasagjerët" active /><StepLine /><Step n="3" label="Konfirmim" /></div></div>
      </div>
      <main className="mx-auto grid max-w-[1240px] grid-cols-1 gap-5 px-4 py-5 md:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Section icon={<Plane className="h-4 w-4" />} title="Zgjidh fluturimin" subtitle="Kërko dhe cakto itinerarin e rezervimit" action={<span className="hidden items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#7c8b92] sm:flex"><LockKeyhole className="h-3 w-3" /> Inventar i sigurt</span>}>
            <div className="grid grid-cols-1 gap-3 border-b border-[#e8edef] bg-[#f7f9f8] p-4 sm:grid-cols-[1fr_1fr_150px_42px]"><Field label="Nga" value={from} onChange={setFrom} icon={Plane} placeholder="Qytet ose aeroport" /><Field label="Për" value={to} onChange={setTo} icon={Plane} placeholder="Qytet ose aeroport" /><Field label="Data" value={date} onChange={setDate} icon={CalendarDays} type="date" /><button type="button" aria-label="Kërko fluturime" className="mt-auto flex h-10 items-center justify-center rounded-md bg-[#176d67] text-white transition hover:bg-[#125b56]"><Search className="h-4 w-4" /></button></div>
            <div className="space-y-2 p-4">{filtered.map(f => <button type="button" key={f.id} onClick={() => setSelectedId(f.id)} className={cn('relative flex w-full items-center gap-3 rounded-md border p-3 text-left transition hover:border-[#7d9998] hover:bg-[#f9fbfa]', selectedId === f.id ? 'border-[#29485b] bg-[#f4f7f6] ring-1 ring-[#29485b]/10' : 'border-[#e0e6e7] bg-white')}><span className={cn('absolute bottom-0 left-0 top-0 w-1 rounded-l-md', selectedId === f.id ? 'bg-[#c49a4c]' : 'bg-transparent')} /><span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', selectedId === f.id ? 'bg-[#29485b] text-[#f4ead3]' : 'bg-[#edf1f2] text-[#71828b]')}><Plane className="h-3.5 w-3.5 -rotate-45" /></span><span className="w-[94px] shrink-0"><strong className="block truncate text-[11px] tracking-wide text-[#334852]">{f.airline}</strong><small className="font-mono text-[10px] text-[#849199]">{f.flightNumber.slice(0, 2)} {f.flightNumber.slice(2)}</small></span><span className="hidden flex-1 items-center justify-center gap-4 sm:flex"><span className="text-right"><strong className={cn('block text-[14px]', num)}>{f.departureTime}</strong><small className="text-[9px] uppercase tracking-[.12em] text-[#8b989e]">{f.fromAirport}</small></span><span className="flex w-20 flex-col items-center gap-1"><small className={cn('text-[10px]', num)}>{f.departureDate}</small><span className="relative block h-px w-full bg-[#cbd5d7]"><Plane className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-90 text-[#c49a4c]" /></span><small className="text-[8px] uppercase tracking-[.16em] text-[#8b989e]">Direkt</small></span><span><strong className={cn('block text-[14px]', num)}>{f.arrivalTime}</strong><small className="text-[9px] uppercase tracking-[.12em] text-[#8b989e]">{f.toAirport}</small></span></span><span className="flex-1 sm:hidden"><strong className={cn('block text-[14px]', num)}>{f.departureTime} <ArrowRight className="inline h-3 w-3 text-[#8b989e]" /> {f.arrivalTime}</strong><small className="text-[10px] text-[#8b989e]">{f.fromAirport} · {f.toAirport}</small></span><span className="border-l border-[#e6ebec] pl-3 text-right"><strong className={cn('block text-[18px] font-bold', num)}>{money(f.adultPrice)}</strong><small className="text-[9px] font-semibold uppercase tracking-[.09em] text-[#73858c]">{f.availableSeats} vende</small></span>{selectedId === f.id && <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#29485b] text-white"><Check className="h-2.5 w-2.5" /></span>}</button>)}</div>
            <div className="mx-4 mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[#dbe4e5] bg-[#dbe4e5] sm:grid-cols-4">{[['Çmim adult', selected.adultPrice], ['Çmim fëmijë', selected.childPrice], ['Çmim foshnje', selected.infantPrice], ['Taksa', selected.tax]].map(([label, value]) => <div key={String(label)} className="bg-[#f7faf9] px-3 py-2.5"><span className="block text-[9px] uppercase tracking-[.1em] text-[#839198]">{label}</span><strong className={cn('mt-1 block text-[14px]', num)}>{money(Number(value))}</strong></div>)}</div>
          </Section>
          <Section icon={<Building2 className="h-4 w-4" />} title="Klienti dhe agjencia" subtitle="Detajet e faturimit dhe kontaktit">
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-6"><div className="md:col-span-2"><Field label="Emri i klientit *" value={customer} onChange={setCustomer} icon={User} /></div><div className="md:col-span-2"><Field label="Email" value={email} onChange={setEmail} icon={Mail} type="email" /></div><div className="md:col-span-2"><Field label="Telefon" value={phone} onChange={setPhone} icon={Phone} /></div><label className="relative md:col-span-3"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.12em] text-[#71808b]">Agjencia (opsionale)</span><button type="button" onClick={() => setAgentOpen(!agentOpen)} className="flex h-10 w-full items-center justify-between rounded-md border border-[#d8e0e4] bg-[#fbfcfc] px-3 text-left text-[13px] text-[#334852]"><span>{agentId ? agents.find(a => a.id === agentId)?.company : 'Direct Booking'}</span><ChevronDown className="h-4 w-4 text-[#8997a0]" /></button>{agentOpen && <span className="absolute left-0 right-0 top-[64px] z-20 overflow-hidden rounded-md border border-[#d8e0e4] bg-white py-1 shadow-lg">{[{ id: null, label: 'Direct Booking' }, ...agents.map(a => ({ id: a.id, label: `${a.name} (${a.company})` }))].map(a => <button type="button" key={String(a.id)} onClick={() => { setAgentId(a.id); setAgentOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-[#f2f6f5]"><Check className={cn('h-3.5 w-3.5 text-[#176d67]', agentId === a.id ? 'opacity-100' : 'opacity-0')} />{a.label}</button>)}</span>}</label><div className="md:col-span-1"><Field label="Komision (€)" value={commission} onChange={setCommission} icon={BadgePercent} type="number" /></div><div className="md:col-span-2"><Field label="Zbritje (€)" value={discount} onChange={setDiscount} type="number" placeholder="0" /></div><label className="md:col-span-6"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.12em] text-[#71808b]">Shënime të brendshme</span><span className="relative block"><NotebookPen className="absolute left-3 top-3 h-3.5 w-3.5 text-[#8997a0]" /><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Kërkesa speciale, alergji, etj..." className="min-h-[68px] w-full resize-y rounded-md border border-[#d8e0e4] bg-[#fbfcfc] px-3 py-2.5 pl-9 text-[13px] text-[#27313a] outline-none focus:border-[#487d7a] focus:bg-white" /></span></label></div>
          </Section>
          <Section icon={<Users className="h-4 w-4" />} title="Pasagjerët" subtitle="Emrat duhet të përputhen me dokumentin e udhëtimit" action={<div className="flex gap-1.5">{(['adult', 'child', 'infant'] as const).map(t => <button type="button" key={t} onClick={() => addPassenger(t)} className="flex h-8 items-center gap-1 rounded-md border border-[#d6e0e1] bg-white px-2 text-[10px] font-semibold text-[#53666e] transition hover:bg-[#eff5f3]"><Plus className="h-3 w-3" />{typeLabels[t]}</button>)}</div>}>
            <div className="space-y-2 p-4">{passengers.map((p, i) => <div key={p.id} className="overflow-hidden rounded-md border border-[#dbe3e4] bg-white"><button type="button" onClick={() => setExpanded(expanded === i ? -1 : i)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#f8faf9]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7efed] text-[#356c69]">{p.type === 'infant' ? <Baby className="h-4 w-4" /> : <User className="h-4 w-4" />}</span><span className="flex-1"><strong className="block text-[12px] text-[#334852]">{p.firstName || 'Pasagjer i ri'} {p.lastName}</strong><small className="text-[10px] text-[#849198]">{typeLabels[p.type]} · <span className={num}>{money(Number(p.ticketPrice || 0))}</span></small></span><span className="rounded-full bg-[#edf1f2] px-2 py-1 text-[9px] font-semibold uppercase tracking-[.08em] text-[#6f8088]">{p.firstName && p.lastName ? 'Gati' : 'Mungojnë të dhëna'}</span><ChevronDown className={cn('h-4 w-4 text-[#87959b] transition-transform', expanded === i && 'rotate-180')} />{passengers.length > 1 && <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); removePassenger(i); }} className="ml-1 rounded p-1.5 text-[#8c989d] hover:bg-[#f3e9e6] hover:text-[#9b5b4d]"><Trash2 className="h-3.5 w-3.5" /></span>}</button>{expanded === i && <div className="grid grid-cols-1 gap-3 border-t border-[#e8edef] bg-[#fafcfb] p-4 sm:grid-cols-2"><Field label="Emri *" value={p.firstName} onChange={v => updatePassenger(i, { firstName: v })} /><Field label="Mbiemri *" value={p.lastName} onChange={v => updatePassenger(i, { lastName: v })} /><Field label="Datëlindja" value={p.dateOfBirth} onChange={v => updatePassenger(i, { dateOfBirth: v })} type="date" /><Field label="Çmimi i biletës (€)" value={p.ticketPrice} onChange={v => updatePassenger(i, { ticketPrice: v })} type="number" /><div className="sm:col-span-2 grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3"><Toggle label="Bagazh i regjistruar" icon={BriefcaseBusiness} price={selected.checkedBaggagePrice} checked={p.baggageOption === 'checked'} onClick={() => updatePassenger(i, { baggageOption: p.baggageOption === 'checked' ? '' : 'checked' })} /><Toggle label="Zgjedhje vendi" icon={Armchair} price={selected.seatSelectionPrice} checked={p.hasSeatSelection} onClick={() => updatePassenger(i, { hasSeatSelection: !p.hasSeatSelection })} /><Toggle label="Prioritet & sigurim" icon={ShieldCheck} price={selected.priorityBoardingPrice + selected.insurancePrice} checked={p.hasPriorityBoarding || p.hasInsurance} onClick={() => updatePassenger(i, { hasPriorityBoarding: !p.hasPriorityBoarding, hasInsurance: !p.hasInsurance })} /></div></div>}</div>)}</div>
          </Section>
        </div>
        <aside className="lg:sticky lg:top-[126px] lg:self-start"><div className="overflow-hidden rounded-lg border border-[#cbd9d8] bg-[#fffefa] shadow-[0_3px_12px_rgba(37,54,64,.06)]"><div className="border-b border-[#dce6e4] bg-[#edf5f2] px-5 py-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#5e7f7b]">Përmbledhje</p><h2 className="mt-1 text-[17px] font-bold text-[#29474e]">Detajet e rezervimit</h2></div><Receipt className="h-5 w-5 text-[#39756f]" /></div><div className="mt-4 flex items-center gap-2"><span className="rounded bg-[#d4e8e1] px-2 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#27665f]">Në proces</span><span className="text-[10px] text-[#71847f]">Autosave aktiv</span></div></div><div className="space-y-4 p-5"><div className="rounded-md border border-[#e1e8e7] bg-[#fbfcfb] p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#71818a]">{selected.airline}</span><span className={cn('text-[11px] font-semibold', num)}>{selected.flightNumber}</span></div><div className="mt-3 flex items-center justify-between"><div><strong className={cn('block text-[20px]', num)}>{selected.departureTime}</strong><small className="text-[10px] text-[#7e8c92]">{selected.fromAirport}</small></div><div className="flex flex-1 flex-col items-center px-3"><span className="text-[9px] text-[#7e8c92]">{selected.departureDate}</span><span className="my-1 h-px w-full bg-[#c6d4d2]" /><span className="text-[9px] uppercase tracking-[.12em] text-[#7e8c92]">Direkt</span></div><div className="text-right"><strong className={cn('block text-[20px]', num)}>{selected.arrivalTime}</strong><small className="text-[10px] text-[#7e8c92]">{selected.toAirport}</small></div></div></div><div className="space-y-2 border-b border-[#e5eaeb] pb-4"><Line label={`Biletë · ${passengers.length} pasagjerë`} value={totals.ticket} /><Line label="Taksa aeroporti" value={totals.tax} /><Line label="Shërbime shtesë" value={totals.extras} />{Number(markup) > 0 && <Line label="Markup" value={Number(markup) * passengers.length} />}{Number(discount) > 0 && <Line label="Zbritje" value={-Number(discount)} />}</div><div className="flex items-end justify-between"><span><span className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#71818a]">Totali përfundimtar</span><span className="mt-1 block text-[11px] text-[#87949a]">EUR · përfshirë taksat</span></span><strong className={cn('text-[28px] font-bold tracking-tight', num)}>{money(totals.total)}</strong></div><button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#29485b] text-[12px] font-bold text-white transition hover:bg-[#1f3b4b]"><FileText className="h-4 w-4" /> Krijo rezervimin</button><p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-[#819097]"><CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[#a17e43]" /> Kontrolloni emrat dhe datëlindjet para konfirmimit.</p></div></div></aside>
      </main>
      <div className="mx-auto flex max-w-[1240px] items-center gap-2 px-4 pb-8 pt-1 text-[10px] text-[#829097] md:px-8"><Clock3 className="h-3.5 w-3.5" /> Sesioni i punës ruhet automatikisht · Kings Travel Operations</div>
    </form>
  </div>;
}
function Step({ n, label, done, active }: { n: string; label: string; done?: boolean; active?: boolean }) { return <div className="flex items-center gap-2 py-2"><span className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold', done ? 'border-[#78a89e] bg-[#e0efeb]' : active ? 'border-[#77909b] bg-[#e5ebee]' : 'border-[#cad5d8] bg-white')}><span className={num}>{done ? '✓' : n}</span></span><span className={cn('hidden text-[11px] font-semibold sm:inline', active || done ? 'text-[#334c56]' : 'text-[#859399]')}>{label}</span></div>; }
function StepLine({ done }: { done?: boolean }) { return <span className={cn('mx-2 h-px flex-1', done ? 'bg-[#8eb4ac]' : 'bg-[#d8e0e2]')} />; }
function Line({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between text-[12px]"><span className="text-[#708089]">{label}</span><span className={cn('font-semibold', num)}>{value < 0 ? `−€${Math.abs(Math.round(value))}` : money(value)}</span></div>; }