// Historiku i versioneve. Ngarkohet vetëm nga faqja Cilësimet (chunk më vete),
// që të mos rëndojë ngarkimin e parë të panelit.

export interface ChangelogEntry {
  version: string;
  date?: string; // YYYY-MM-DD
  notes: string[];
}

// Më i riu lart.
export const CHANGELOG: ChangelogEntry[] = [
  { version: "1.550", date: "2026-10-31", notes: ["Menaxherët hapin përsëri Pagesat, Agjentët, Lejet dhe Biletat e grupit (më parë dilte \"Forbidden\"). Faqja e Pagesave ngarkohet shumë më shpejt, databaza ka indekse të reja, Dashboard-i tregon deri në 100 rezervimet e fundit për status dhe \"Sot\" numërohet sipas orës së Shqipërisë."] },
  { version: "1.549", date: "2026-10-31", notes: ["Mbeten vetëm dy tema: Blu & Ar dhe Gri Klasik. Kush kishte zgjedhur një temë tjetër kalon automatikisht te Gri Klasik."] },
  {
    version: "1.548",
    date: "2026-10-30",
    notes: ["Ora e rifreskimit të përditshëm të Google caktohet te Cilësimet; shfaqet rifreskimi i ardhshëm. Intervali i vjetërsisë së çmimit mbetet i veçantë."],
  },
  { version: "1.547", date: "2026-10-30", notes: ["Claim menaxhohet vetëm nga butoni lart: krijim i ri ose lidhje me claim ekzistues brenda dritares; seksioni i poshtëm hiqet pa ndryshuar lidhjet ekzistuese."] },
  { version: "1.546", date: "2026-10-29", notes: ["Butoni Claim pranë Krijo Detyrë në krye të rezervimit, me të njëjtin formular dhe lidhje automatike me rezervimin."] },
  { version: "1.545", date: "2026-10-29", notes: ["Menaxhimi i përdoruesve nga faqja Agjentët: lidhje me llogari ekzistuese ose krijim i një llogarie të re pa dyfishuar agjencinë; konfirmim dhe rihyrje pas ndryshimit të agjencisë."] },
  { version: "1.544", date: "2026-10-28", notes: ["Aktiviteti i agjentëve me përshkrime të kuptueshme, pamje të përmirësuar dhe shkarkim PDF; raport ditor në 00:01 me PDF të ndara për agjentët me aktivitet."] },
  { version: "1.543", date: "2026-10-27", notes: ["Administratori mund të lidhë përdoruesin e ri me një agjent ekzistues, pa krijuar agjenci të dyfishtë dhe pa ndryshuar grupin ose të dhënat e saj."] },
  { version: "1.542", date: "2026-10-27", notes: ["Ofertat e reja për agjentët dërgohen me email, me foton dhe të dhënat e ofertës. Discount tregon ecurinë e dërgimit; ofertat ekzistuese nuk ridërgohen."] },
  { version: "1.541", date: "2026-10-22", notes: ["Përgjigjet Google lexojnë saktë kodet e aeroporteve; kontrollet e dështuara ose të paplota nuk shënojnë fluturimet si të dyshimta."] },
  { version: "1.540", date: "2026-10-21", notes: ["Kërkesat Google koordinohen me kufizim paralelizmi, bashkim të kërkesave identike dhe përparësi për kontrollet manuale; pritje mbrojtëse kur ofruesi kufizon kërkesat."] },
  { version: "1.539", date: "2026-10-17", notes: ["Njoftimet e ndryshimit të orarit krahasojnë edhe datën e plotë të mbërritjes nga Google; përditësimi mbetet manual nga veprimi ekzistues."] },
  { version: "1.538", date: "2026-10-17", notes: ["Datat e mbërritjes korrigjohen sipas orarit gjatë krijimit dhe zgjatjes; listë e veçantë për fluturimet e dyshuara për gabim orari."] },
  { version: "1.537", date: "2026-10-16", notes: ["Historiku i fluturimit me emërtime shqip dhe kontrolle teknike të dallueshme; burimi i jashtëm shfaqet vetëm si Offline, edhe në ngjarjet e vjetra."] },
  { version: "1.536", date: "2026-10-15", notes: ["Tema Blu & Ar: paneli majtas sipas referencës dhe ikonat e statistikave, duke ruajtur pamjet dhe funksionet ekzistuese."] },
  { version: "1.535", date: "2026-10-15", notes: ["Baneri publik në mobile shfaqet i hapur poshtë përshkrimit dhe sipër kërkimit, me tekst dhe numërim të përshtatur për ekranin."] },
  { version: "1.534", date: "2026-10-15", notes: ["Teksti i afatit të banerit publik dhe parapamjes në 12 px, bold."] },
  { version: "1.533", date: "2026-10-15", notes: ["Tekstet e vogla të banerit dhe etiketat e numërimit më të mëdha e të lexueshme, pa ndryshuar gjerësinë ose numrat kryesorë."] },
  { version: "1.532", date: "2026-10-15", notes: ["Shiriti i brendshëm jeshil me tekst të bardhë; shënimi për Tiranën hiqet nga të dy banerët, pa ndryshuar afatet."] },
  { version: "1.531", date: "2026-10-15", notes: ["Baneri publik dhe parapamja shfaqen në anglisht; paneli dhe shiriti i brendshëm mbeten shqip."] },
  { version: "1.530", date: "2026-10-15", notes: ["Shirit i hollë në krye të panelit me uljet aktive, afatin dhe kohën e mbetur, pavarësisht aktivizimit të banerit publik."] },
  { version: "1.529", date: "2026-10-15", notes: ["Banner hiqet nga menuja dhe si faqe më vete; editori mbetet vetëm brenda Discount."] },
  { version: "1.528", date: "2026-10-15", notes: ["Mini-editori Banner hapet drejtpërdrejt nga oferta në faqen Discount, me parapamje live dhe mbrojtje të ndryshimeve të paruajtura."] },
  { version: "1.527", date: "2026-10-15", notes: ["Faqja Banner: editor ngjyrash me parapamje live dhe baner publik i lidhur me ofertat Discount, periudhat dhe afatin real."] },
  { version: "1.526", date: "2026-10-15", notes: ["Shenjë rrethore kompakte për discount-in, me ngjyrë sipas kombinimit të kanaleve dhe detaje me mouse ose klikim."] },
  { version: "1.525", date: "2026-10-14", notes: ["Faqja Discount: oferta me afat, periudha fluturimesh, kanale dhe prioritet; zbritja manuale ka përparësi dhe rezervimet ekzistuese nuk ndryshojnë."] },
  { version: "1.524", date: "2026-10-14", notes: ["Pa Çmim përfshin fluturimet e reja ende pa çmim Google dhe shfaq arsyen e mungesës, pa ndryshuar çmimet ose kontrollet automatike."] },
  { version: "1.523", date: "2026-10-14", notes: ["Historiku i plotë i fluturimit për administratorin bashkon ngjarjet e lidhura, regjistrimin në databazë dhe burimin e veprimeve, me faqezim."] },
  { version: "1.522", date: "2026-10-14", notes: ["Skeda Pa grup shfaqet me të kuqe dhe numër vetëm kur ka fluturime të ardhshme pa grup."] },
  { version: "1.521", date: "2026-10-14", notes: ["Filtri i grupeve përfshin Pa grup: shfaq vetëm fluturimet pa grup në kolonën GRUPET, edhe për Përzgjidh të gjitha."] },
  { version: "1.520", date: "2026-10-14", notes: ["Filtri Pasagjerët shfaq vetëm fluturimet me fiks aq vende të lira. Filtrimi, faqezimi dhe Përzgjidh të gjitha përdorin të njëjtin numër."] },
  { version: "1.519", date: "2026-10-14", notes: ["Task automatik kur vendet e lira bien nga mbi 10 në 10 ose më pak, nga shitja apo ulja e vendeve. Fluturimi i lidhur në Task hap direkt editimin."] },
  { version: "1.518", date: "2026-10-14", notes: ["Të gjitha kategoritë te Cilësimet nisin të palosura dhe hapen veçmas me Zgjero / Mbyll. Vlerat dhe ndryshimet e paruajtura ruhen kur një kategori mbyllet."] },
  { version: "1.517", date: "2026-10-14", notes: ["Faqet / Modulet shfaqet e palosur si parazgjedhje; Zgjero hap listën me rreshta kompaktë horizontalë. Funksionet e moduleve mbeten të pandryshuara."] },
  { version: "1.516", date: "2026-10-14", notes: ["Njoftimet e rikonsiliimit POK mund të mbyllen dhe ruhen te lista Të mbyllura, pa ndryshuar pagesat ose linket e tyre."] },
  { version: "1.515", date: "2026-10-13", notes: ["Listat shkurtohen që e gjithë pjesa djathtas, përfshirë filtrat dhe Rregull aktiv, të përfundojë në nivel me kutinë Offline. Pa ndryshime në çmime ose funksione."] },
  { version: "1.514", date: "2026-10-13", notes: ["Listat e gjata ndalen te fundi i kutisë Çmimi Offline dhe lëvizin vetëm brenda kutive. Pozicioni, çmimet dhe përzgjedhjet mbeten të pandryshuara."] },
  { version: "1.513", date: "2026-10-13", notes: ["Kutitë e fluturimeve përfundojnë në të njëjtin nivel me rregullat e çmimeve majtas; filtrat vendosen poshtë. Pa ndryshime në çmime ose përzgjedhje."] },
  { version: "1.512", date: "2026-10-13", notes: ["Listat e përzgjedhjes së fluturimeve në rregullat e çmimeve: rreshta kompaktë njëlinjësh dhe kuti më të gjata. Pa ndryshime në llogaritje ose përzgjedhje."] },
  { version: "1.511", date: "2026-10-13", notes: ["Përzgjedhja e fluturimeve në rregullat e çmimeve me dy lista; heqja përfshin edhe datat historike. Formula dhe periudha e rregullit mbeten të pandryshuara."] },
  { version: "1.510", date: "2026-10-13", notes: ["Njoftimet PRIORITY shfaqin kodin KTF të rezervimit përkatës; klikimi mbi kod hap rezervimin. Pa ndryshime në pagesa ose email-e."] },
  { version: "1.509", date: "2026-10-13", notes: ["Filtri UNPAID te Rezervimet e Mia në web dhe telefon: vetëm rezervimet me pagesë të paplotë, pa rezervimet e anuluara."] },
  { version: "1.508", date: "2026-10-13", notes: ["Rezervimet e Mia në telefon: karta të lexueshme me pasagjerin, itinerarin, datat dhe shumat e ndara; pamja në kompjuter dhe funksionet mbeten të pandryshuara."] },
  { version: "1.507", date: "2026-10-13", notes: ["Price Summary në pamjen e re ndahet sipas numrit dhe shumës për të rritur, fëmijë dhe foshnja; shtesat dhe totali mbeten të pandryshuara."] },
  { version: "1.506", date: "2026-10-12", notes: ["Logo më e lehtë në portal, ngarkim i vetëm i fonteve dhe cache për skedarët statikë me hash. Pa ndryshime në funksionet e sistemit."] },
  { version: "1.505", date: "2026-10-12", notes: ["Pamja e re e rezervimit: detajet e fluturimit në të djathtë dhe zgjedhja Mashkull/Femër me butona, pa ndryshuar funksionin e rezervimit."] },
  { version: "1.504", date: "2026-10-12", notes: ["Bagazhi te pamja e re e rezervimit shfaqet në kuti me ikonë valixheje dhe theksim kur zgjidhet. Çmimi dhe funksioni mbeten të pandryshuara."] },
  { version: "1.503", date: "2026-10-12", notes: ["Sfond me qiell dhe krah avioni te pamja e re e faqes kryesore. Fotografi e kompresuar, pa ndryshuar tekstet, kërkimin ose zgjedhjen e pamjeve."] },
  { version: "1.502", date: "2026-10-12", notes: ["Faqja kryesore përshtatet me pamjen e re të portalit; pamja aktuale dhe e re zgjidhen veçmas te Cilësimet → Faqet. Funksionet dhe përmbajtja ekzistuese ruhen."] },
  { version: "1.501", date: "2026-10-12", notes: ["Pamja e miratuar e fluturimeve dhe rezervimit në portal, me shirit datash dhe çmime reale. Përzgjedhje e pavarur e pamjeve te Cilësimet. Pa ndryshime në pagesa, email-e ose API-në e partnerëve."] },
  { version: "1.500", date: "2026-10-12", notes: ["Discount-et e reja kanë si parazgjedhje të katër kanalet: OFFLINE, API, TË GJITHË AGJENTËT dhe PUBLIC. Discount-et ekzistuese ruajnë kanalet e zgjedhura."] },
  { version: "1.499", date: "2026-10-12", notes: ["Zgjedhje e pavarur e pamjes për çdo faqe te Cilësimet, e ndarë për faqet e brendshme dhe të jashtme. Pamjet aktuale mbeten parazgjedhje; pamjet e Canvas-it janë në përgatitje. Formularët e hapur e marrin pamjen e re kur rihapen."] },
  { version: "1.498", date: "2026-10-12", notes: ["Përzgjedhje kanalesh për discount: OFFLINE, API, TË GJITHË AGJENTËT dhe PUBLIC. Ulja zbatohet vetëm te kanalet e zgjedhura; rezervimet ekzistuese nuk ndryshojnë."] },
  { version: "1.497", date: "2026-10-12", notes: ["Korrigjuar adresa e ruajtjes së discount-it në VPS. Ruajtja konfirmohet vetëm kur serveri kthen discount-in e kërkuar; përgjigjet HTML nuk pranohen si sukses."] },
  { version: "1.496", date: "2026-10-12", notes: ["Discount për fluturimin me përqindje ose shumë fikse, pas çmimit të agjencisë. Shfaqet brenda dhe në portal, vetëm për rezervimet e reja; pa ulje mbi shtesat dhe taksat."] },
  { version: "1.495", date: "2026-10-11", notes: ["Kontrollet e inbox-it ndajnë rezultatin e përkohshëm, nuk mbivendosen dhe ndalen në skedat e fshehura. Email-et, rezervimet dhe pagesat mbeten të pandryshuara."] },
  { version: "1.494", date: "2026-10-11", notes: ["Filtrat Nisja dhe Mbërritja rifreskojnë aeroportet nga fluturimet ekzistuese, në të gjitha statuset, pa përdorur lista të vjetruara.", "Historiku i çmimeve shfaq kolonën Çmimi Google me vlerën e ruajtur për secilin ndryshim."] },
  { version: "1.493", date: "2026-10-09", notes: ["PRIORITY lexon edhe përmbajtjen HTML të email-eve kur versioni tekst nuk përmban bagazhin e kabinës.", "Kontrolli PRIORITY vazhdon edhe me modulin e Email-it të çaktivizuar.", "Raportet e agjencive përdorin të njëjtin model brenda dhe jashtë sistemit; mënyrat Cash shfaqen vetëm CASH."] },
  { version: "1.492", date: "2026-10-08", notes: ["Kontroll historik PRIORITY sipas datës së email-it, me progres, rezultate të ruajtura dhe pa dyfishim të njoftimeve."] },
  { version: "1.491", date: "2026-10-08", notes: ["Skeda PRIORITY te njoftimet: email-et e reja të rezervimeve me Cabin luggage të blerë, pavarësisht çmimit apo sasisë mbi zero."] },
  { version: "1.490", date: "2026-10-08", notes: ["Përzgjedhje individuale dhe mbyllje në grup e njoftimeve të importit dhe bagazheve, me konfirmim dhe raportim të dështimeve."] },
  { version: "1.489", date: "2026-10-08", notes: ["Email-et që dështojnë ruhen privatisht me titull, marrës dhe bashkëngjitje; administratorët mund t'i ridërgojnë nga Njoftimet."] },
  {
    version: "1.488",
    date: "2026-10-08",
    notes: ["Progres live për kontrollin automatik te Çmim i Ri: pritja në radhë, grupet e kontrolluara dhe përfundimi i ciklit. Intervali dhe rregullat mbeten të pandryshuara."],
  },
  {
    version: "1.487",
    date: "2026-10-08",
    notes: ["Raporte PDF të pagesave dhe detyrimeve në portalin e agjentëve, me filtrim sipas datës dhe dërgim me email."],
  },
  {
    version: "1.486",
    date: "2026-10-08",
    notes: ["Alternativat Google me çmim unavailable nuk bllokojnë më rezultatet e vlefshme. Kontrollet e anashkaluara raportohen veçmas nga rezultatet e pabesueshme."],
  },
  {
    version: "1.485",
    date: "2026-10-07",
    notes: ["Kontrollo Çmime + Orare ndan numëruesin e mungesave me rikontrollet automatike dhe raporton ndryshimet e çmimit Google, orarit, mundësinë e anulimit dhe gabimet teknike."],
  },
  {
    version: "1.484",
    date: "2026-10-07",
    notes: ["Mundësi anulimi shfaqet edhe te Njoftime pas 5 kontrolleve të vlefshme pa kodin e fluturimit. Gabimet teknike nuk numërohen dhe statusi i fluturimit nuk ndryshohet."],
  },
  {
    version: "1.483",
    date: "2026-10-07",
    notes: ["U korrigjua adresa e butonit të përjashtimit nga Google në versionin e publikuar. Kryqi i zi u zhvendos poshtë Konfirmuar, në fund të panelit të fluturimit."],
  },
  {
    version: "1.482",
    date: "2026-10-07",
    notes: ["Buton Aktivizo / Çaktivizo për të gjithë Monitorimin Wizz; ndalon kontrollet automatike dhe manuale, duke ruajtur monitorimet dhe rezultatet."],
  },
  {
    version: "1.481",
    date: "2026-10-07",
    notes: ["Kryqi i zi te fluturimi çaktivizon kontrollet Google dhe e heq nga listat Google/Njoftime, duke e mbajtur në listën normale. Klikimi përsëri i aktivizon."],
  },
  {
    version: "1.480",
    date: "2026-10-06",
    notes: ["Kontrollet e “Çmim i Vjetër” dhe “Pa Çmim” nuk presin më përfundimin e gjithë ciklit të “Çmim i Ri”: radha lirohet mes grupeve të përfunduara, pa kërkime të njëkohshme."],
  },
  {
    version: "1.479",
    date: "2026-10-06",
    notes: ["Fluturimet “Përjashtuar Online” nuk përfshihen te “Pa Rregull Google”: as në listë, as në numërim, as te “Zgjidh të gjitha”."],
  },
  {
    version: "1.478",
    date: "2026-10-06",
    notes: ["Skeda “Pa Rregull Google” shfaq fluturimet e ardhshme që nuk mbulohen nga asnjë rregull aktiv Google dhe fshihet automatikisht kur nuk ka rezultate."],
  },
  {
    version: "1.477",
    date: "2026-10-06",
    notes: ["Krijim fluturimi: kalendari “Përsërit deri më…” hapet nga data e nisjes dhe bllokon datat/muajt më të hershëm. Një datë përsëritjeje e pavlefshme pastrohet kur ndryshon nisja."],
  },
  {
    version: "1.476",
    date: "2026-10-06",
    notes: ["Fluturime të palistuara: gabimet e kërkimit regjistrohen sipas linjës dhe datës, me statusin HTTP ose arsyen teknike, pa ruajtur çelësa sekretë apo përgjigje të papërpunuara."],
  },
  {
    version: "1.475",
    date: "2026-10-05",
    notes: ["Rregullim i gabimit që bllokonte listën e fluturimeve: numërimi Çmim i Vjetër lexon në mënyrë të sigurt cilësimet tekst/JSON."],
  },
  {
    version: "1.474",
    date: "2026-10-05",
    notes: ["Skedat me 0 fluturime fshihen pas ngarkimit të numërimeve dhe rishfaqen kur kanë fluturime. Skeda aktive e boshatisur kalon automatikisht te një skedë me fluturime."],
  },
  {
    version: "1.473",
    date: "2026-10-05",
    notes: ["Çmim i Vjetër: 5 kontrolle radhazi me intervalin e cilësimeve; pa çmim pas kontrollit të pestë, fluturimi kalon vetëm te Fluturime të dyshimta. Numërimi ruhet pas rinisjes dhe zerohet kur gjendet çmimi."],
  },
  {
    version: "1.472",
    date: "2026-10-05",
    notes: ["Rikthehet subjekti i mëparshëm “Ndryshim Rezervimi” për emailin e ruajtjes. Subjektet e email-eve sipas statusit mbeten të pandryshuara."],
  },
  {
    version: "1.471",
    date: "2026-10-04",
    notes: ["Rikontrolli ekzistues i fluturimeve të dyshuara krahason edhe oraret nga e njëjta përgjigje Google dhe shfaq ndryshimet e verifikuara. Pa kontroll shtesë, pa ndryshim automatik të orareve, çmimeve ose statusit."],
  },
  {
    version: "1.470",
    date: "2026-10-04",
    notes: ["Ngarkim paraprak i faqeve kryesore nga menuja; ruajtje më e gjatë në memorie e faqeve të rezervimeve me rifreskim në çdo rikthim. Ripërdorim i datave të përpunuara në filtrimin e rezervimeve, pa ndryshim të filtrave apo llogaritjeve."],
  },
  {
    version: "1.469",
    date: "2026-10-04",
    notes: ["Kolonat e listës së fluturimeve kanë përmasa kompakte dhe rreshtim të njëjtë për titujt e vlerat. Zhvendosje me tërheqje, zgjerim/ngushtim dhe dyklik për përshtatje. Menuja Kolonat ruan/rikthen renditjen, gjerësitë dhe dukshmërinë si parazgjedhje për llogarinë në shfletues."],
  },
  {
    version: "1.468",
    date: "2026-10-04",
    notes: ["Aktiviteti i agjentëve dallon klikimet reale, faqet, kërkimet dhe kërkesat API. Kërkimet tregojnë itinerarin, datën dhe numrin e të rriturve, fëmijëve e foshnjave. Lidhjet dhe butonat regjistrohen pa përmbajtjen e formularëve; filtrat dhe eksporti dallojnë llojet e aktivitetit."],
  },
  {
    version: "1.467",
    date: "2026-10-04",
    notes: ["Kontrolli ekzistues Çmim i Ri kontrollon edhe oraret, dyshimin për anulim dhe disponueshmërinë për numrin e konfiguruar të vendeve, në të njëjtin cikël dhe për të njëjtat fluturime. Vetëm njoftime, pa ndryshuar statusin apo vendet; përfshin Përjashtuar nga Google, por jo Sold Out. Nuk shtohet orar i ri kontrolli."],
  },
  {
    version: "1.466",
    date: "2026-10-04",
    notes: ["Fluturimet e dyshuara te Njoftimet rikontrollohen çdo 5 minuta. Sold Out përjashtohen nga listat e kontrollit. Shfaqen rezultati, numri i mungesave dhe koha e kontrollit. Gabimet teknike dhe përgjigjet boshe nuk numërohen si mungesë; statusi, çmimi dhe shitja mbeten të pandryshuara."],
  },
  {
    version: "1.465",
    date: "2026-10-04",
    notes: [
      "Ruajtja e rezervimit kryhet e gjitha bashkë, përfshirë pasagjerët, shtesat, pagesat dhe historikun; në gabim nuk ruhet asnjë ndryshim.",
      "Komisioni dhe teprica në kuletë llogariten nga vlerat përfundimtare. Riprovimet nuk dyfishojnë pagesat apo kreditimet.",
      "Ruajtja përdor një kërkesë të vetme; dërgimi i emailit të biletës vazhdon në sfond me gjendje të qartë në ndërfaqe.",
    ],
  },
  {
    version: "1.464",
    date: "2026-10-03",
    notes: ["Përditësimet live rifreskojnë secilën listë vetëm një herë për njoftim, edhe pas rilidhjes. Të gjitha përditësimet ekzistuese ruhen, pa ndryshuar llogaritjet."],
  },
  {
    version: "1.463",
    date: "2026-10-03",
    notes: ["Lista Premium ngarkon vetëm 50 rezervime për faqe, me filtrim dhe renditje në server. Totalet e filtrimit dhe eksportet e plota PDF/Excel ruhen; kërkimi shmang kërkesat për çdo shkronjë dhe përditësimet live mbeten aktive."],
  },
  {
    version: "1.462",
    date: "2026-10-03",
    notes: ["Menuja merr vetëm numrin e drafteve, pa ngarkuar listën e plotë të rezervimeve. Kontrolli çdo 60 sekonda dhe funksionimi i rezervimeve mbeten të pandryshuar."],
  },
  {
    version: "1.461",
    date: "2026-10-03",
    notes: ["Shënimet e foshnjave dhe bagazheve në kolonën PAX shfaqin vetëm ikonën dhe numrin, pa INF/BAG apo shenjën +. Numërimi mbetet i pandryshuar."],
  },
  {
    version: "1.460",
    date: "2026-10-03",
    notes: ["Rruga e fluturimit në tabelën Premium shfaqet kompakte, p.sh. TIA-HAM, pa ikonën e avionit. Ylli i konfirmimit ruhet."],
  },
  {
    version: "1.459",
    date: "2026-10-03",
    notes: ["U hoq shënimi “Dje” poshtë datës në tabelën Premium të rezervimeve; datat dhe filtrat mbeten të pandryshuara."],
  },
  {
    version: "1.458",
    date: "2026-10-03",
    notes: ["Njoftimi i versionit dhe butoni Hard Refresh mbeten të disponueshëm edhe kur faqja shfaq një gabim."],
  },
  {
    version: "1.457",
    date: "2026-10-03",
    notes: ["U korrigjua gabimi gjatë ngarkimit të rezervimeve nga rimatja e kolonave. Ruhen gjerësitë si në Excel, përmirësimet e PDF-së dhe filtri i periudhës së fluturimit."],
  },
  {
    version: "1.456",
    date: "2026-10-03",
    notes: ["Kolonat e rezervimeve zgjerohen/ngushtohen si në Excel, me dyklik për përshtatje dhe ruajtje të gjerësive në llogari. PDF-ja përfshin orën e fluturimit dhe rreshta të njëtrajtshëm pa ndarje teksti. Filtri i fluturimit mbështet periudhën nga/deri."],
  },
  {
    version: "1.455",
    date: "2026-10-03",
    notes: ["Kolonat financiare kanë gjerësi të llogaritura për katër shifra, pa zgjerim automatik. Data e fluturimit në tabelën Premium shfaqet DD.MM.YYYY. Raportet, llogaritjet dhe të dhënat e ruajtura mbeten të pandryshuara."],
  },
  {
    version: "1.454",
    date: "2026-10-03",
    notes: ["U optimizuan hapësirat e kolonave të tjera në tabelën Premium: datat, REF, PNR, Ora dhe PAX janë më kompakte. Tekstet, shenjat, rreshtimi vertikal dhe kolonat financiare ruhen; raportet dhe llogaritjet nuk ndryshojnë."],
  },
  {
    version: "1.453",
    date: "2026-10-03",
    notes: ["Kolonat financiare të tabelës Premium janë më kompakte, me hapësirë për vlera deri në katër shifra dhe simbolet përkatëse. Rreshtimi djathtas, raportet dhe llogaritjet mbeten të pandryshuara."],
  },
  {
    version: "1.452",
    date: "2026-10-03",
    notes: ["Tabela Premium ka zgjedhësin e kolonave me “Ruaj default” për çdo llogari në çdo pajisje dhe rikthim të pamjes fillestare. Numrat PAX qëndrojnë të rreshtuar edhe kur ka INF ose BAG. Raportet, eksportet dhe llogaritjet mbeten pa ndryshim."],
  },
  {
    version: "1.451",
    date: "2026-10-03",
    notes: ["Në tabelën Premium, Fluturimi, Data dhe Ora shfaqen veçmas; Totali, Neto, Komisioni, Paguar, Detyrimi dhe Kredit kanë secila kolonën e vet. Raportet, eksportet, dokumentet dhe llogaritjet mbeten pa ndryshim."],
  },
  {
    version: "1.450",
    date: "2026-10-03",
    notes: ["Paleta e ngjyrave të agjencive u zgjerua në 64 ngjyra të gatshme, të renditura 8 × 8. Ngjyra e zgjedhur shënohet qartë; zgjedhja e lirë dhe heqja e ngjyrës mbeten të disponueshme."],
  },
  {
    version: "1.449",
    date: "2026-10-03",
    notes: ["Çdo agjenci mund të ketë një ngjyrë të zgjedhshme për emrin dhe referencën KTF në listën e rezervimeve. Ngjyra mund të hiqet; raportet, dokumentet dhe API-ja e partnerëve mbeten pa ndryshim."],
  },
  {
    version: "1.448",
    date: "2026-10-03",
    notes: ["Në listën e rezervimeve u hoq shkrimi i vogël “PNR” nga etiketa dhe katrori me inicialet e agjencisë. Kodi PNR, emri dhe renditja e agjencisë, raportet dhe dokumentet mbeten pa ndryshim."],
  },
  {
    version: "1.447",
    date: "2026-10-03",
    notes: ["Në listën e rezervimeve, data e sotme shfaqet jeshile pa shënimin “Sot”. Datat e tjera, raportet dhe dokumentet mbeten pa ndryshim."],
  },
  {
    version: "1.446",
    date: "2026-10-03",
    notes: ["Kodi CP dhe globi nuk shfaqen më në listën e rezervimeve; kodi CP shfaqet brenda rezervimit. Raportet dhe dokumentet e shkarkuara mbeten pa ndryshim."],
  },
  {
    version: "1.445",
    date: "2026-10-03",
    notes: ["Njoftimet pozitive shfaqen me sfond jeshil dhe gabimet me sfond të kuq; dërgimi i pakonfirmuar i biletës dhe gjetja e pjesshme nuk shfaqen si sukses."],
  },
  {
    version: "1.444",
    date: "2026-10-03",
    notes: [
      "Korrigjim i PDF-së së raportit të orareve për shigjetat dhe karakteret që nuk mbështeten nga fonti.",
      "Dështimet e raporteve dhe email-eve shfaqen te Njoftime Importi dhe Sistemi, edhe kur posta nuk punon; njoftimet e përsëritura bashkohen.",
    ],
  },
  {
    version: "1.443",
    date: "2026-10-01",
    notes: ["Pa çmim aktual shfaqet “S’ka çmim”; kontrollet e suksesshme pa asnjë çmim krijojnë njoftimin “S’gjendet · mundësi anulimi”, pa ndryshuar statusin e fluturimit."],
  },
  {
    version: "1.442",
    date: "2026-10-01",
    notes: ["Kolona Google shfaq vetëm çmimin aktual ose minimumin aktual të alternativave; pa çmim dhe kontrollet e paverifikuara dallohen pa shfaqur vlera të vjetra."],
  },
  {
    version: "1.441",
    date: "2026-10-01",
    notes: ["Historia dhe balanca e agjentit rifreskohen menjëherë pas pagesës masive, pa mbyllur faqen dhe pa humbur konfirmimin e suksesit."],
  },
  {
    version: "1.440",
    date: "2026-09-29",
    notes: ["Cilësim POK për link të ri në çdo tentativë, fillimisht i fikur; verifikim më i rreptë i pagesave dhe shqyrtim i pagesave të dyfishta."],
  },
  {
    version: "1.439",
    date: "2026-09-29",
    notes: ["IP-ja aktuale mund të zhbllokohet normalisht ose të bllokohet pas paralajmërimit dhe konfirmimit të rrezikut të humbjes së aksesit."],
  },
  {
    version: "1.438",
    date: "2026-09-28",
    notes: ["Cilësimet → Faqet / Modulet: aktivizim dhe çaktivizim i moduleve të pavarura, me bllokim të faqeve, kërkesave dhe proceseve automatike. Funksionet e përbashkëta të rezervimeve, pagesave, Booking Engine dhe API-së së partnerëve mbeten të mbrojtura."],
  },
  {
    version: "1.437",
    date: "2026-09-28",
    notes: ["Monitorimi Wizz lejon ndryshimin e intervalit automatik në krye të faqes: fillimisht 12 orë, i zbatueshëm për të gjitha monitorimet aktive."],
  },
  {
    version: "1.436",
    date: "2026-09-28",
    notes: ["Shënimet individuale dhe masive të pagesave ruhen pa ringarkuar regjistrin. Faqja dhe grupet e hapura ruhen; pagesat ku shënimi dështon mbeten të zgjedhura për riprovë."],
  },
  {
    version: "1.435",
    date: "2026-09-28",
    notes: ["Butoni Debitorë merr pamje të kuqe me gradient, ikonë të bardhë, qoshe të rrumbullakosura dhe dallim të qartë kur filtri është aktiv."],
  },
  {
    version: "1.434",
    date: "2026-09-28",
    notes: ["Regjistri i Pagesave shfaq 10, 30 ose 50 rezultate për faqe, me Para / Next. Filtrat dhe eksporti PDF ruhen; përzgjedhja masive kufizohet te faqja e hapur."],
  },
  {
    version: "1.433",
    date: "2026-09-27",
    notes: ["Te pagesat manuale të rezervimeve, pagesat masive dhe depozitat në wallet, mënyra e pagesës duhet zgjedhur shprehimisht. Metodat e pavlefshme nuk ruhen; redaktimi ruan metodën ekzistuese të pagesës. Regjistrimi shënon pagesë të marrë ose kredit të zbritur nga wallet-i, jo domosdoshmërisht para fizike."],
  },
  {
    version: "1.432",
    date: "2026-09-27",
    notes: ["Periudhë personale për grupin e çdo agjenti: zëvendëson datat e grupit vetëm për atë agjent, pa ndryshuar aeroportet ose drejtimet. Mundësi rikthimi te datat e grupit."],
  },
  {
    version: "1.431",
    date: "2026-09-27",
    notes: ["Plotësim i përkthimit anglisht në faqen e jashtme dhe mesazhe të qarta gabimi sipas gjuhës së zgjedhur."],
  },
  {
    version: "1.430",
    date: "2026-09-27",
    notes: ["Rikthimi i rezervimit rillogarit shumën e paguar nga pagesat aktive, që detyrimi i agjentit të përputhet me rezervimin."],
  },
  {
    version: "1.429",
    date: "2026-09-27",
    notes: [
      "Aksesi i vizitorëve caktohet duke zgjedhur një grup ekzistues; grupet e reja shfaqen në listë.",
      "Pa grup vizitorët nuk shohin fluturime. Rregullat e grupit nuk hapin fluturimet e fshehura nga Booking Engine.",
      "Aksesi i përdoruesve të loguar, API-ja e partnerëve dhe eksportet mbeten të pandryshuara.",
    ],
  },
  {
    version: "1.428",
    date: "2026-09-26",
    notes: [
      "Regjistrimet e reja nga faqja publike presin miratimin dhe grupin nga administratori; llogaritë ekzistuese nuk ndryshojnë.",
      "Te Agjentët shfaqet numëruesi i kuq i regjistrimeve në pritje, miratimi dhe statusi i email-eve të njoftimit/aktivizimit.",
      "Badge-i i shënimeve vendoset pranë yllit Konfirmuar dhe bllokimi i jashtëm shfaqet vetëm me ikonë.",
    ],
  },
  {
    version: "1.427",
    date: "2026-09-26",
    notes: [
      "Te Cilësimet → Aksesi i vizitorëve, administratori cakton aeroportet, drejtimin dhe datat e nisjes që shohin vizitorët pa u loguar.",
      "Kufizimi i aktivizuar pa rregulla nuk lejon rezultate; përdoruesit e loguar, grupet, API-ja e partnerëve dhe eksportet nuk ndryshojnë.",
    ],
  },
  {
    version: "1.426",
    date: "2026-09-26",
    notes: [
      "Te filtrat e Fluturimeve, administratori mund të zgjedhë një grup për të parë vetëm fluturimet që përputhen me aeroportet, drejtimin dhe datat e rregullave të tij, në të gjitha faqet e rezultateve.",
      "Përzgjedhja e të gjitha fluturimeve dhe numrat e skedave respektojnë grupin; API-ja e partnerëve dhe eksportet nuk ndryshojnë.",
    ],
  },
  {
    version: "1.425",
    date: "2026-09-26",
    notes: [
      "Kolona Grupet vendoset menjëherë pas Google te lista e fluturimeve dhe te Çmim i Ri; renditja përputhet edhe me zgjedhësin e kolonave.",
      "Etiketat e grupeve shfaqin vetëm shkronjën e parë të emrit, ndërsa emri i plotë mbetet i dukshëm kur kalon mausin sipër.",
    ],
  },
  {
    version: "1.424",
    date: "2026-09-26",
    notes: [
      "Agjencitë pa grup nuk shohin asnjë fluturim në Booking Engine dhe nuk mund të bëjnë rezervime të reja, edhe kur kanë rregulla individuale të ruajtura ose leje për fluturime të fshehura.",
      "Rregullat dhe përjashtimet e përgjithshme të vjetra ruhen por nuk janë më aktive. Vizitorët, klientët pa agjenci dhe rezervimet ekzistuese nuk ndryshojnë.",
    ],
  },
  {
    version: "1.423",
    date: "2026-09-26",
    notes: [
      "Te lista dhe detajet e fluturimit, administratori sheh në etiketa blu grupet që përputhen me itinerarin dhe datën e nisjes; emri i plotë shfaqet kur kalon mausin sipër.",
      "Kolona informuese Grupet nuk ndryshon rregullat e aksesit, API-në e partnerëve ose përmbajtjen e eksporteve.",
    ],
  },
  {
    version: "1.422",
    date: "2026-09-26",
    notes: [
      "Te rregullat e grupeve të agjencive, datat e nisjes Nga/Deri janë të detyrueshme për rregullat e reja dhe mund të vendosen duke ndryshuar rregullat ekzistuese.",
      "Rregullat e vjetra pa data vazhdojnë të vlejnë pa afat deri në ndryshimin e tyre. Kufijtë e periudhës përfshihen të dy.",
    ],
  },
  {
    version: "1.421",
    date: "2026-09-26",
    notes: [
      "Agjencitë organizohen sipas grupit/shtetit; grupi kërkohet për agjenci të reja dhe ndryshime profili. Agjencitë ekzistuese pa grup ruajnë përkohësisht aksesin aktual.",
      "Te Cilësimet menaxhohen grupet dhe rregullat e përhershme sipas aeroportit: nisje, mbërritje ose të dyja. Grupi Shqipëri përgatitet për fluturimet nga ose drejt TIA.",
      "Rregullat e grupit zëvendësojnë default-in e përbashkët; përjashtimet individuale u shtohen. Vetëm administratori ndryshon grupet dhe aksesin.",
    ],
  },
  {
    version: "1.420",
    date: "2026-09-26",
    notes: [
      "Te Cilësimet → Rregullat e agjencive, administratori vendos rregulla default për aksesin e të gjitha agjencive në Booking Engine dhe kërkon agjencitë që përjashtohen.",
      "Rregullat e veçanta te profili i agjencisë u shtohen rregullave default; agjencitë e përjashtuara ruajnë rregullat e veta ose dukshmërinë e mëparshme.",
    ],
  },
  {
    version: "1.419",
    date: "2026-09-26",
    notes: [
      "Te aksesi i agjentit në Booking Engine, njëri aeroport mund të lihet bosh: vetëm nisja përfshin çdo destinacion, vetëm mbërritja përfshin çdo origjinë. Periudha e datave mbetet e detyrueshme.",
    ],
  },
  {
    version: "1.418",
    date: "2026-09-26",
    notes: [
      "Administratori mund të kufizojë fluturimet që sheh e rezervon një agjent në Booking Engine sipas aeroporteve dhe periudhës së nisjes, ose të lejojë fluturime konkrete si përjashtim.",
      "Agjentët pa rregulla vazhdojnë të shohin fluturimet si më parë; rregullat e reja zbatohen edhe te kërkimi, detajet dhe krijimi i rezervimit.",
    ],
  },
  {
    version: "1.417",
    date: "2026-09-26",
    notes: [
      "Te rezervimet online emri i klientit merret automatikisht nga emri dhe mbiemri i pasagjerit të parë, jo nga emri i llogarisë së agjencisë.",
    ],
  },
  {
    version: "1.416",
    date: "2026-09-25",
    notes: [
      "Faqja Agjentët ngarkohet më lehtë: raportet, gjenerimi i PDF-ve, detajet dhe aktiviteti i agjentit hapen vetëm kur kërkohen.",
    ],
  },
  {
    version: "1.415",
    date: "2026-09-25",
    notes: [
      "Butoni 'Bëj Hard Refresh' në njoftimin e versionit të ri është më i madh dhe zë gjithë gjerësinë në telefon; shfaq menjëherë gjendjen 'Duke rifreskuar…'.",
      "Njoftimi respekton zonën e sipërme të sigurt të telefonit dhe butoni i mbylljes ka zonë prekjeje më të madhe.",
    ],
  },
  {
    version: "1.414",
    date: "2026-09-25",
    notes: [
      "Te Pagesat, kalimi nga PENDING në KONFIRMUAR kërkon miratim në një dialog në qendër të faqes, për pagesat individuale, masive dhe ato të zgjedhura.",
      "Dialogu tregon referencën, mënyrën, numrin dhe shumën e pagesave përpara konfirmimit.",
    ],
  },
  {
    version: "1.413",
    date: "2026-09-25",
    notes: [
      "Rezervime provë pa pagesë në Kyte Sandbox për administratorët: formular pasagjerësh, status dhe historik që ruhet edhe pas rifreskimit.",
      "Mbrojtje ndaj rezervimit të dyfishtë dhe etiketim i qartë se nuk lëshohet biletë reale.",
    ],
  },
  {
    version: "1.412",
    date: "2026-09-25",
    notes: [
      "Kërkim Kyte Sandbox në panelin e administratorit: shfaq oferta fluturimesh, pa krijuar rezervime.",
    ],
  },
  {
    version: "1.411",
    date: "2026-09-24",
    notes: [
      "Tentativat e hyrjes nga IP e bllokuar njoftohen me email me kufizim kundër spam-it; përdoruesi sheh 'Kërko Akses'.",
      "Pas fjalëkalimit të saktë, administratori merr kod njëpërdorimësh 60-sekondësh; vetëm sesioni i verifikuar lejohet nga IP-ja e bllokuar.",
      "Hyrjet me kod shfaqen si 'Me verifikim' te historiku dhe te IP-të e njohura; IP-ja mbetet e bllokuar.",
    ],
  },
  {
    version: "1.410",
    date: "2026-09-24",
    notes: [
      "Te Siguria dhe Aksesi i IP-ve, administratori mund t'i vendosë emër IP-së dhe secilit shfletues të identifikuar veçmas.",
      "Hyrjet e reja dallojnë profilin e shfletuesit edhe nëse ndryshon IP-ja; hyrjet e vjetra pa identifikues mbeten të panjohura.",
    ],
  },
  {
    version: "1.409",
    date: "2026-09-24",
    notes: [
      "Te IP dhe Hyrjet, të dyja listat mund të shfaqin 10, 20, 50, 100 ose të gjitha rezultatet; IP-të mund të përzgjidhen dhe të bllokohen ose zhbllokohen në grup.",
      "Pas bllokimit ose zhbllokimit, gjendja ndryshon në rresht pa ringarkuar listën; gabimet e veprimeve në grup shfaqen veçmas.",
    ],
  },
  {
    version: "1.408",
    date: "2026-09-24",
    notes: [
      "Te Cilësimet → IP dhe Hyrjet, administratori sheh IP-të e hyrjeve të suksesshme, sesionet aktive në 15 minutat e fundit dhe historikun e tentativave; mund të bllokojë ose zhbllokojë një IP vetëm për sistemin e brendshëm.",
    ],
  },
  {
    version: "1.407",
    date: "2026-09-24",
    notes: [
      "Faqet e sistemit ngarkohen veçmas për hapje më të shpejtë; rifreskimi live kufizohet te të dhënat përkatëse.",
      "Ndryshimi i statusit të rezervimit tregon progresin, pengon klikimet e dyfishta dhe dallon lëshimin e biletës nga dërgimi i emailit.",
      "Kërkimi Google te Fluturimi i Ri kryhet në sfond me progres; te Cilësimet mund të shkarkohet raporti lokal i matjeve të shpejtësisë.",
      "Numëratori i Detyrave merr vetëm numrin e detyrave aktive, pa ngarkuar listën e plotë.",
    ],
  },
  {
    version: "1.406",
    date: "2026-09-22",
    notes: [
      "Monitorimi Wizz lejon vetëm një monitorim për çdo linjë, pavarësisht periudhës, me bllokim të dublikatave edhe në server.",
      "Çdo monitorim mund të modifikohet për të ndryshuar emrin, aeroportet dhe datat e kërkimit; rezultatet e vjetra pastrohen kur ndryshon kërkimi.",
    ],
  },
  {
    version: "1.405",
    date: "2026-09-22",
    notes: [
      "Monitorimi Wizz pranon disa aeroporte nisjeje të ndara me presje dhe krijon automatikisht nga një monitorim drejt të njëjtit destinacion, duke anashkaluar dublikatat identike.",
      "Komisionet negative tani shfaqen saktë në listën e agjentëve dhe brenda faqes së agjentit.",
    ],
  },
  {
    version: "1.404",
    date: "2026-09-22",
    notes: ["Historia e Krediteve dhe Rezervimet në faqen e agjentit tani kanë pagination të pavarur me 5, 10, 30, 50 ose Të gjitha; default shfaqen 5 më të fundit."],
  },
  {
    version: "1.403",
    date: "2026-09-22",
    notes: ["Faqja e çdo agjenti tani ka filtër Nga data / Deri më datë që filtron njëkohësisht totalet, kartat financiare, historinë e krediteve, rezervimet dhe raportet."],
  },
  {
    version: "1.402",
    date: "2026-09-22",
    notes: ["Tabela e Monitorimit Wizz tani ka rreshta më kompaktë dhe datat shfaqen horizontalisht në një rresht."],
  },
  {
    version: "1.401",
    date: "2026-09-22",
    notes: ["Monitorimi Wizz tani kontrollon çdo rrugë afërsisht çdo 12 orë dhe, pasi mbarojnë të gjitha rrugët, riprovon një herë vetëm datat ku Google nuk u përgjigj."],
  },
  {
    version: "1.400",
    date: "2026-09-21",
    notes: ["Asistenti AI tani mund të propozojë veprime të kontrolluara për detyra, rezervime, fluturime dhe pagesa; asnjë ndryshim nuk kryhet pa konfirmim eksplicit."],
  },
  {
    version: "1.399",
    date: "2026-09-21",
    notes: ["Asistenti AI u zgjerua me informacion read-only për fluturimet, rezervimet, pasagjerët, financat, agjentët, detyrat, njoftimet, monitorimet dhe auditimin."],
  },
  {
    version: "1.398",
    date: "2026-09-21",
    notes: ["Asistenti AI tani shfaq qartë kur llogaria OpenAI nuk ka kredit të disponueshëm."],
  },
  {
    version: "1.397",
    date: "2026-09-21",
    notes: ["Te Monitorimi Wizz u shtua butoni “Ruaj dhe Krijo Tjetër”, që mban datat default dhe pastron aeroportet për monitorimin pasues."],
  },
  {
    version: "1.395",
    date: "2026-09-21",
    notes: ["Rregulli default i Monitorimit Wizz ruan vetëm datat; aeroportet plotësohen veçmas për çdo monitorim të ri."],
  },
  {
    version: "1.394",
    date: "2026-09-21",
    notes: ["Monitorimi Wizz tani ka rregull default me aeroporte dhe data fikse që plotësojnë automatikisht monitorimet e reja."],
  },
  {
    version: "1.393",
    date: "2026-09-21",
    notes: ["U hoq kufiri maksimal prej 62 ditësh për intervalin e Monitorimit Wizz."],
  },
  {
    version: "1.392",
    date: "2026-09-21",
    notes: ["Butoni Rezervimet në panelin majtas tani dallohet me ngjyrë jeshile."],
  },
  {
    version: "1.391",
    date: "2026-09-21",
    notes: ["U errësua sfondi blu i kutive të filtrave për dallim më të qartë nga faqja."],
  },
  {
    version: "1.390",
    date: "2026-09-21",
    notes: ["Kutitë e filtrave në sistem kanë sfond blu të dallueshëm, border më të qartë dhe kontrast më të mirë nga faqja."],
  },
  {
    version: "1.389",
    date: "2026-09-21",
    notes: ["U shtua faqja Claim në panelin kryesor të sistemit."],
  },
  {
    version: "1.388",
    date: "2026-09-21",
    notes: ["Fushat e shumës së pagesës ndryshojnë vetëm nga shifrat e shkruara, jo nga scroll-i ose shigjetat."],
  },
  {
    version: "1.387",
    date: "2026-09-21",
    notes: ["Statusi i pagesave shfaqet gjithmonë si KONFIRMUAR ose PENDING, pa qeliza bosh në regjistër dhe në PDF."],
  },
  {
    version: "1.386",
    date: "2026-09-21",
    notes: ["U shtua monitorimi i çmimeve Wizz Air për të zbuluar automatikisht rëniet e tarifave."],
  },
  {
    version: "1.385",
    date: "2026-09-21",
    notes: ["Konfirmimi i pagesave individuale, masive ose të përzgjedhura nuk ringarkon më të gjithë Regjistrin e Pagesave; pas ruajtjes në server përditësohen vetëm rreshtat e konfirmuar."],
  },
  {
    version: "1.384",
    date: "2026-09-21",
    notes: ["Historia e Krediteve lejon zgjedhjen e pagesave një nga një ose Select All dhe shkarkimin e tyre në një PDF të përbashkët me të dhënat e Klient/Faturë dhe Konfirmuar/Pending."],
  },
  {
    version: "1.383",
    date: "2026-09-21",
    notes: ["Historia e Krediteve te faqja e agjentit shfaq qartë Klient/Faturë dhe Konfirmuar/Pending, ndërsa faturat mund të shkarkohen edhe për pagesat individuale dhe për çdo anëtar të pagesës masive."],
  },
  {
    version: "1.382",
    date: "2026-09-21",
    notes: ["Regjistri i Pagesave ka filtra kryesorë për Klient/Faturë, Konfirmuar/Pa konfirmuar dhe grupe pagesash Bankë, Cash ose Kartë (POK); Banka dhe Cash përfshijnë të gjitha metodat përkatëse."],
  },
  {
    version: "1.381",
    date: "2026-09-20",
    notes: ["Ndryshimet normale të statusit ruhen realisht në server me përgjigje të shpejtë; ekrani përditësohet vetëm pas konfirmimit të databazës, pa pritur rileximin e plotë të rezervimit."],
  },
  {
    version: "1.380",
    date: "2026-09-20",
    notes: ["Ndryshimi i statusit tani ruan paraprakisht vetëm fushat e ndryshuara të rezervimit; fushat e paprekura nuk kontrollohen ose ridërgohen më."],
  },
  {
    version: "1.379",
    date: "2026-09-20",
    notes: ["Pamja e “Fluturimeve të Detajuara” tani ka grafik të pasagjerëve sipas datës dhe rreshta kompaktë për çdo nisje, me status, mbushje, shitje dhe rezervime."],
  },
  {
    version: "1.378",
    date: "2026-09-20",
    notes: ["Te Raportet u shtua “Fluturimet e Detajuara”: zgjedhje e një ose disa itinerareve me numër fluturimi, pipeline statusesh, ndarje sipas datës, mbushje, agjentë, financa dhe eksport PDF."],
  },
  {
    version: "1.377",
    date: "2026-09-20",
    notes: ["Rezervimet e anuluara nuk shfaqen më nga filtrat Paid, Partially Paid ose Unpaid pa zgjedhur posaçërisht statusin Anuluar."],
  },
  {
    version: "1.376",
    date: "2026-09-20",
    notes: ["Filtri Paid, Partially Paid dhe Unpaid tani kërkon në gjithë historikun dhe në të gjitha statuset kur nuk është zgjedhur një status specifik."],
  },
  {
    version: "1.375",
    date: "2026-09-20",
    notes: ["U shtua filtri financiar Paid, Partially Paid dhe Unpaid te lista premium e rezervimeve; lista, numërimi dhe eksportet përdorin të njëjtin filtër."],
  },
  {
    version: "1.374",
    date: "2026-09-20",
    notes: ["Filtri i agjencive te lista premium e rezervimeve tani ka kërkim dhe lejon zgjedhjen e disa agjencive njëkohësisht."],
  },
  {
    version: "1.373",
    date: "2026-09-16",
    notes: ["U korrigjua fusha e çmimit të pasagjerit në krijimin e rezervimit: në telefon dhe desktop tani shfaq, llogarit dhe dërgon vetëm euro të plota."],
  },
  {
    version: "1.372",
    date: "2026-09-16",
    notes: ["Çmimet dhe llogaritjet e reja tani përdorin vetëm euro të plota në sistem, Booking Engine, email, PDF dhe raporte; diferencat pozitive nën €1 nuk krijojnë detyrim ose kredit automatik."],
  },
  {
    version: "1.371",
    date: "2026-09-15",
    notes: ["Rezervimet mund të biletohen pa i dërguar menjëherë email agjentit; këto raste shënohen me badge të kuq, filtrohen në listë dhe butoni jeshil mbetet derisa emaili të dërgohet."],
  },
  {
    version: "1.370",
    date: "2026-09-15",
    notes: ["Te detajet e rezervimit, seksioni “Informacion Klienti” tani shfaqet i mbyllur dhe zgjerohet me klikim mbi titullin."],
  },
  {
    version: "1.369",
    date: "2026-09-15",
    notes: ["U shtua faqja informative “Njoftime Atlas”, e cila kontrollon Atlas Production dhe shfaq fluturimet që pranojnë më pak se 9 pasagjerë, pa ndryshuar statuset, vendet ose çmimet."],
  },
  {
    version: "1.368",
    date: "2026-09-13",
    notes: ["Lista e Debitorëve tani lejon zgjedhjen individuale ose të të gjithë agjentëve të filtruar dhe shkarkimin e tyre në një PDF të përbashkët."],
  },
  {
    version: "1.367",
    date: "2026-09-13",
    notes: ["Kontrolli automatik i itinerareve nis menjëherë pas ruajtjes edhe kur datat e fluturimeve janë në të ardhmen; kontrollet pasuese vazhdojnë sipas intervalit."],
  },
  {
    version: "1.363",
    date: "2026-09-13",
    notes: ["Fushat e shumave te pagesat dhe krediti i agjentit përdorin euro të plota, pa shifra dhjetore dhe pa shigjetat e rritjes/uljes."],
  },
  {
    version: "1.362",
    date: "2026-09-13",
    notes: ["Kontroll automatik në nisjen e serverit që llogaria ekzistuese POK të importohet e enkriptuar te Pagesat me Kartë pa pritur hapjen e Cilësimeve."],
  },
  {
    version: "1.361",
    date: "2026-09-13",
    notes: ["Pagesat me Kartë: administrim i sigurt i llogarive POK Pay me kredenciale të enkriptuara, një llogari aktive dhe porosi të lidhura me llogarinë e nisjes."],
  },
  {
    version: "1.360",
    date: "2026-09-13",
    notes: ["Referencat e booking engine ruajnë formatin ekzistues KTF + 4 shifra, me kontroll unik dhe rigjenerim automatik kur kodi ekziston."],
  },
  {
    version: "1.359",
    date: "2026-09-13",
    notes: ["Referencat e booking engine tani përdorin hapësirë më të madhe dhe riprovohen automatikisht ndaj kodit ekzistues; gabimet e serverit shfaqen pa query teknike."],
  },
  {
    version: "1.358",
    date: "2026-09-13",
    notes: ["Fushat e datave hapin kalendarin me klikim; zgjedhja e datës së parë vendos automatikisht të dytën në të njëjtën ditë dhe data e dytë nuk mund të jetë më e hershme."],
  },
  {
    version: "1.357",
    date: "2026-09-13",
    notes: ["Ruajtja e itinerareve automatike nuk bllokohet më nga rreshta të pazgjedhur me kode aeroporti të paplota në inventar."],
  },
  {
    version: "1.356",
    date: "2026-09-12",
    notes: ["Zbulimi i fluturimeve tani ruan një listë itinerarësh automatikë sipas rrugës, datave dhe intervalit; itineraret me inventar aktiv menaxhohen veçmas dhe kërkimi vazhdon vetëm për Wizz Air."],
  },
  {
    version: "1.355",
    date: "2026-09-12",
    notes: ["Fluturimet e palistuara: kërkimi manual dhe automatik vetëm për Wizz Air; çmimi i foshnjës fiks 35 € sipas sistemit, i vendosur automatikisht gjatë shtimit."],
  },
  {
    version: "1.354",
    date: "2026-09-12",
    notes: ["Faqe e veçantë 'Fluturime të palistuara' në panelin majtas: zbulon fluturime direkte sipas itinerarit dhe datave, përfshirë numra e kompani që mungojnë në inventar. Kërkim manual ose automatik opsional, shtim me çmim të zgjedhur dhe 20 vende fillestare, ose injorim."],
  },
  {
    version: "1.353",
    date: "2026-09-12",
    notes: ["Interval i veçantë në minuta për rikontrollin e fluturimeve me pak vende (1/3 dhe 2/3), fillimisht 5 minuta. Rikontrolli nis i pavarur nga kontrolli i përgjithshëm, duke ruajtur mbrojtjen ndaj rezultateve të mbivendosura dhe rregullat Sold Out."],
  },
  {
    version: "1.352",
    date: "2026-09-12",
    notes: ["Kërkimi në filtrat e qyteteve pastrohet pasi klikohet një opsion, pa humbur përzgjedhjet. Vlen për listën e fluturimeve dhe listën Offline."],
  },
  {
    version: "1.351",
    date: "2026-09-11",
    notes: ["Numri fillestar i vendeve për fluturimet e reja është 20 në format e krijimit, përfshirë shtimin nga llojet e fluturimeve dhe fluturimet e gjetura. Importi pa numër vendesh dhe modeli Excel përdorin gjithashtu 20; fluturimet ekzistuese nuk ndryshohen."],
  },
  {
    version: "1.350",
    date: "2026-09-11",
    notes: ["Krediti i agjentëve pranon edhe shuma negative. Zbritjet ruhen në historik me referencën dhe shënimet, pa ndryshuar pagesat e rezervimeve."],
  },
  {
    version: "1.349",
    date: "2026-09-11",
    notes: [
      "U aktivizua në sistemin live numëruesi 1/3, 2/3, 3/3 te njoftimet për pak vende. Kontrollet manuale dhe automatike përdorin të njëjtin numërues të kontrolleve të vlefshme radhazi.",
    ],
  },
  {
    version: "1.348",
    date: "2026-09-11",
    notes: [
      "Në shiritin e sipërm u shtuan data e sotme, ora live me sekonda dhe etiketa e kuqe LIVE. Ora përdor gjithmonë zonën Europe/Tirane, korrigjohet menjëherë kur rikthehesh te skeda dhe nuk gjeneron kërkesa në API.",
    ],
  },
  {
    version: "1.347",
    date: "2026-09-09",
    notes: [
      "Kontrolli i çmimeve te Cilësimet tani menaxhon veçmas “Pa Çmim” dhe “Çmim i Vjetër” në të njëjtën kartë, secili me aktivizim, interval, kontroll manual dhe kohën e kontrollit të fundit.",
    ],
  },
  {
    version: "1.346",
    date: "2026-09-09",
    notes: [
      "Fluturimet “Përjashtuar Online” kontrollohen përsëri nga Google për çmim, orar dhe vende, por nuk kalojnë automatikisht Sold Out dhe çmimi i tyre i shitjes nuk ndryshohet nga Rregullat Google.",
    ],
  },
  {
    version: "1.345",
    date: "2026-09-09",
    notes: [
      "Grafika e pasagjerëve në Dashboard tani ndjek të njëjtin interval Nga/Deri si numri i pasagjerëve sipër dhe rifreskon kolonat e totalin sipas filtrimit.",
    ],
  },
  {
    version: "1.344",
    date: "2026-09-07",
    notes: [
      "Të dhënat identifikuese të fluturimeve tani ruhen në një format të njëjtë nga çdo mënyrë krijimi ose ndryshimi; listat dhe rregullat e çmimeve bashkojnë saktë variantet e vjetra pa humbur fluturimet sipas datave.",
      "Eksporti Offline normalizon kodet në mënyrë të sigurt dhe ruan ndarjen e numrit të fluturimit, p.sh. W64722 si W6 + 4722.",
    ],
  },
  {
    version: "1.343",
    date: "2026-09-07",
    notes: [
      "Fluturimet “Përjashtuar Online” mund të kontrollohen dhe përditësohen manualisht për çmimin Google nga paneli i adminit; proceset automatike mbeten të bllokuara.",
    ],
  },
  {
    version: "1.342",
    date: "2026-09-07",
    notes: [
      "Çdo anulim rezervimi kalon detyrimisht nga veprimi i dedikuar që rikthen vendet e adultëve dhe fëmijëve; infantët nuk ndikojnë në vendet.",
    ],
  },
  {
    version: "1.341",
    date: "2026-09-07",
    notes: [
      "Te profili i agjentit u shtua shkarkimi direkt PDF i raportit të detyrimeve.",
    ],
  },
  {
    version: "1.340",
    date: "2026-09-07",
    notes: [
      "Te faqja Agjentët u shtuan filtrat Nga/Deri dhe zgjedhja sipas datës së krijimit ose datës së fluturimit; të gjitha statistikat dhe totali rillogariten për periudhën.",
    ],
  },
  {
    version: "1.339",
    date: "2026-09-07",
    notes: [
      "Përjashtimi Online tani zbatohet edhe te kontrolli individual i çmimit live, kontrolli i fluturimeve të zgjedhura dhe raportet manuale të orareve.",
    ],
  },
  {
    version: "1.338",
    date: "2026-09-07",
    notes: [
      "Fluturimet te “Përjashtuar Online” nuk përfshihen më në asnjë kërkim automatik ose manual të çmimeve, orareve apo disponueshmërisë nga Google/RapidAPI.",
    ],
  },
  {
    version: "1.337",
    date: "2026-09-07",
    notes: [
      "Te Kryej Rezervim, sfondi jeshil i fluturimeve të konfirmuara me yll u bë më i plotë dhe me kontrast më të fortë ndaj fluturimeve blu.",
    ],
  },
  {
    version: "1.336",
    date: "2026-09-07",
    notes: [
      "Te Kryej Rezervim, fluturimet pa yll tani kanë sfond blu premium me kontur elegant në desktop dhe telefon; fluturimet me yll mbeten jeshile.",
    ],
  },
  {
    version: "1.335",
    date: "2026-09-07",
    notes: [
      "Te Kryej Rezervim, i gjithë rreshti i fluturimit shfaqet jeshil në desktop dhe telefon kur fluturimi është i konfirmuar me yll, edhe pasi zgjidhet.",
    ],
  },
  {
    version: "1.334",
    date: "2026-09-03",
    notes: [
      "Te Menaxho rezervimin, i gjithë seksioni “Informacion Fluturimi” shfaqet me sfond jeshil të zbehtë kur fluturimi është i konfirmuar me yll.",
    ],
  },
  {
    version: "1.333",
    date: "2026-09-03",
    notes: [
      "Kur kërkimi automatik gjen një biletë në email, lista e rezervimeve tani rifreskohet menjëherë dhe nuk mbetet gabimisht me shenjën “Pa email”.",
    ],
  },
  {
    version: "1.332",
    date: "2026-09-02",
    notes: [
      "Kërkimi automatik për email-et e reja të biletave Wizz tani kryhet çdo minutë, në vend të çdo 5 minutave.",
    ],
  },
  {
    version: "1.331",
    date: "2026-09-02",
    notes: [
      "Te Menaxho rezervimin, butoni “Konfirmo” tani shfaqet i mbushur me blu dhe “Vendos në Pritje” i mbushur me portokalli.",
    ],
  },
  {
    version: "1.330",
    date: "2026-08-31",
    notes: [
      "Teksti “Kopjo për WhatsApp” tani përfshin emrin e agjencisë dhe për pasagjerët fëmijë shfaq datëlindjen në vend të etiketës “fëmijë”.",
    ],
  },
  {
    version: "1.329",
    date: "2026-08-31",
    notes: [
      "Kërkimi i fluturimit te Rezervim i Ri tani filtron menjëherë gjatë shkrimit, pa kërkesë të re në server për çdo shkronjë; mbështet qytetin, kodin e aeroportit dhe datën në të gjitha pamjet.",
    ],
  },
  {
    version: "1.328",
    date: "2026-08-31",
    notes: [
      "Kodi i fluturimit në kartën e rezervimit u zhvendos në header pranë titullit “Informacion Fluturimi”; përsëritja poshtë u hoq dhe rruga fitoi më shumë hapësirë.",
    ],
  },
  {
    version: "1.327",
    date: "2026-08-30",
    notes: [
      "Informacioni i fluturimit në rezervim u riorganizua në tre grupe me ngjyra të lehta për fluturimin, oraret dhe vendet, duke ruajtur lartësinë kompakte.",
    ],
  },
  {
    version: "1.326",
    date: "2026-08-30",
    notes: [
      "Ylli i fluturimit të konfirmuar në listën e rezervimeve u vendos horizontalisht pranë itinerarit, pa krijuar rresht shtesë.",
    ],
  },
  {
    version: "1.325",
    date: "2026-08-30",
    notes: [
      "Karta e informacionit të fluturimit në rezervim u bë më kompakte; Çmimi Ynë dhe Google Flights shfaqen horizontalisht dhe u reduktuan hapësirat vertikale.",
    ],
  },
  {
    version: "1.324",
    date: "2026-08-30",
    notes: [
      "Në listën e rezervimeve, fluturimet e konfirmuara shënohen tani vetëm me yllin ⭐, pa tekstin shtesë, në desktop dhe mobile.",
    ],
  },
  {
    version: "1.323",
    date: "2026-08-26",
    notes: [
      "Rezervimet që i përkasin një fluturimi të konfirmuar shfaqin tani badge-in “Fluturim i Konfirmuar” në listën e rezervimeve, si në pamjen Classic ashtu edhe në Premium dhe mobile.",
    ],
  },
  {
    version: "1.322",
    date: "2026-08-26",
    notes: [
      "Rregullat e Çmimeve sipas Google u zhvendosën nga Cilësimet në një faqe të veçantë, e aksesueshme direkt nga paneli majtas, pa ndryshuar funksionimin e rregullave.",
    ],
  },
  {
    version: "1.321",
    date: "2026-08-25",
    notes: [
      "Kur hapet një rezervim, informacioni i fluturimit shfaqet tani në krye të dritares, para të dhënave të klientit, me numrin, rrugën, datat/oraret, vendet dhe gjendjen reale të fluturimit.",
    ],
  },
  {
    version: "1.320",
    date: "2026-08-25",
    notes: [
      "Kolonat financiare te lista e fluturimeve u ndanë në Shitje, Neto dhe Komisioni; secila mund të shfaqet ose fshihet veçmas te menuja Kolonat.",
      "Raporti PDF i fluturimeve tani pasqyron kolonat e zgjedhura në listë, përfshirë kolonat financiare vetëm për adminin, dhe përshtat vetë orientimin kur raporti ka shumë kolona.",
    ],
  },
  {
    version: "1.319",
    date: "2026-08-25",
    notes: [
      "Te lista e fluturimeve, çdo rresht tani shfaq djathtas totalin e shitjeve, totalin neto dhe komisionin e atij fluturimi. Llogaritja përdor rezervimet aktive dhe përjashton rezervimet e anuluara; vlerat neto dhe komisioni mbeten vetëm për admin.",
    ],
  },
  {
    version: "1.318",
    date: "2026-08-24",
    notes: [
      "Kërkimi i biletave Wizz tani përdor vetëm emailin më të fundit për çdo PNR — nuk kthehet më te një email i vjetër kur Wizz e ka dërguar përsëri të njëjtën PNR me pasagjerë të ndryshëm. Kontrolli bëhet pasagjer më pasagjer: p.sh. nëse gjendet vetëm njëri, shfaqet “1 biletë ekzistuese, 1 pa email”, ruhet PDF-ja vetëm për biletën që ekziston dhe rezervimi vazhdon të rikontrollohet automatikisht.",
    ],
  },
  {
    version: "1.317",
    date: "2026-08-23",
    notes: [
      "Kur fluturimi ka shënime, ato shfaqen tani edhe te dritarja e rezervimit (karta \"Informacion Fluturimi\") si \"Shënime Fluturimi\" — me autorin dhe datën, dhe mund të shtosh shënim të ri direkt që aty. Kur fluturimi s'ka shënime, kutia nuk zë vend fare.",
    ],
  },
  {
    version: "1.316",
    date: "2026-08-23",
    notes: [
      "Shënimet e fluturimit u bënë si bisedë (chat): çdo shënim ruhet menjëherë me autorin dhe datën, dhe nuk ndryshohet dot më pas — vetëm shtohen shënime të reja. Te lista e fluturimeve del vetëm një shenjë e vogël majtas; kur i afron mausin, hapet një tabelë e vogël me të gjitha shënimet. Shënimet mbeten vetëm për sistemin e brendshëm.",
    ],
  },
  {
    version: "1.315",
    date: "2026-08-23",
    notes: [
      "Fluturimet: shtuar fusha 'Shënim' te paneli i editimit — shënimi shfaqet si shenjë (badge) blu te lista e fluturimeve për të gjithë përdoruesit e brendshëm. Shënimi nuk del kurrë te faqja publike (booking-engine) as te API e partnerëve; çdo ndryshim i tij regjistrohet në historikun e fluturimit.",
      "Riparim: fluturimet me vendet e mbushura që mbeteshin gabimisht 'Open' (kur serveri ristartohej në momentin e shitjes) tani kthehen vetë në Sold Out nga një rikontroll automatik sigurie.",
    ],
  },
  {
    version: "1.314",
    date: "2026-08-22",
    notes: [
      "Raportet → Agent Sales: shtuar dy grafikë rrethorë (shitjet dhe komisionet sipas agjentit), grafik kolona ditore Shitje+Komisioni, dhe tabelë e detajuar me numrin e pasagjerëve, mesataren dhe përqindjet. Backend filtron sipas periudhës dhe përjashton rezervimet e anulluara.",
    ],
  },
  {
    version: "1.313",
    date: "2026-08-21",
    notes: [
      "Temë e re 'Midnight Ops' te Cilësimet → Tema e Ndërfaqes: sjell pamje të errët të njëtrajtshme në gjithë Flight System, duke përfshirë panelet, tabelat, format dhe menutë.",
    ],
  },
  {
    version: "1.312",
    date: "2026-08-20",
    notes: [
      "Te Kopjo Listën u rregullua forma e shumësit: 1 vend shfaqet si “1 Vend”, ndërsa 2–4 vende si “X Vende”.",
    ],
  },
  {
    version: "1.311",
    date: "2026-08-20",
    notes: [
      "Te Fluturimet → Kopjo Listën, rreshti i kopjuar shfaq tani “X Vende” vetëm kur fluturimi ka 1–4 vende të lira; me 5 ose më shumë vende formati mbetet i pandryshuar.",
    ],
  },
  {
    version: "1.310",
    date: "2026-08-19",
    notes: [
      "Temë e re “Neo Glass” te Cilësimet → Tema e Ndërfaqes: faqja Krijo Rezervim merr pamjen e errët Neo Glass me të gjitha funksionet reale të rezervimit, ndërsa numrat dhe shumat përdorin një ngjyrë standarde të pandryshueshme.",
    ],
  },
  {
    version: "1.309",
    date: "2026-08-19",
    notes: [
      "Rregullim i njoftimit “Version i ri i sistemit”: bundle-i dhe version.json përdorin tani të njëjtin version të sistemit, ndaj banner-i nuk del më përsëri pas Hard Refresh kur versioni është i njëjtë.",
    ],
  },
  {
    version: "1.308",
    date: "2026-08-19",
    notes: [
      "Te Rregullat e Çmimeve sipas Google u shtua kopjimi: kopja hapet në formular me të gjitha kriteret dhe nivelet e rregullit origjinal, me emër të ri dhe JOAKTIVE derisa ta kontrollosh e aktivizosh.",
    ],
  },
  {
    version: "1.307",
    date: "2026-08-19",
    notes: [
      "Kodet e aeroporteve tani shfaqen dhe ruhen gjithmonë me shkronja të mëdha; variante si TIA/tia bashkohen në një opsion të vetëm në Booking Engine.",
    ],
  },
  {
    version: "1.306",
    date: "2026-08-18",
    notes: [
      "Pagesat masive me Kredit (Wallet): kontrolli i balancës së kuletës tani ekzekutohet GJITHMONË (agjencia zgjidhet nga vetë rezervimet) — balanca e pamjaftueshme refuzohet dhe kuleta s'mund të shkojë në minus.",
    ],
  },
  {
    version: "1.305",
    date: "2026-08-18",
    notes: [
      "Pagesat masive: mesazhi i suksesit nuk fshihet më pas regjistrimit (shkak i dyfishimit aksidental të pagesave).",
      "Mbrojtje kundër pagesave të dyfishta: pagesë identike brenda 2 minutash kërkon konfirmim të qartë para se të regjistrohet.",
    ],
  },
  {
    version: "1.304",
    date: "2026-08-18",
    notes: [
      "Veprim masiv i ri te lista e fluturimeve (vetëm admin): '🙈 Fshih nga B.E.' / '👁 Shfaq në B.E.' — fsheh ose shfaq fluturimet e zgjedhura në faqen publike të Booking Engine me një klik.",
    ],
  },
  {
    version: "1.303",
    date: "2026-08-18",
    notes: [
      "Te lista e fluturimeve u shtua filtri '👁 Booking Engine': Të pafshehura / Të fshehura / Të gjitha — funksionon edhe me 'zgjidh të gjitha' nëpër faqe.",
    ],
  },
  {
    version: "1.302",
    date: "2026-08-18",
    notes: [
      "Dukshmëria në Booking Engine tani ndryshohet edhe brenda dritares së fluturimit (toggle '👁 Në Booking Engine', vetëm admin) — jo vetëm te Cilësimet.",
      "Te lista e fluturimeve, fluturimet e fshehura nga Booking Engine shfaqen me gjithë rreshtin gri.",
    ],
  },
  {
    version: "1.301",
    date: "2026-08-17",
    notes: [
      "Te Rezervimet: kur klikon një çip statusi, data kalon automatikisht në 'Të gjitha' — lista shfaq të gjitha rezervimet e atij statusi dhe përputhet me numrin e çipit.",
    ],
  },
  {
    version: "1.300",
    date: "2026-08-17",
    notes: [
      "Te Rezervimet: filtri i statusit u kthye nga dropdown në çipa të hapur e të klikueshëm (si 'Pa Email/Me Email'), secili me numrin e rezervimeve për atë status mbi gjithë sistemin (Të gjitha); kliko për të filtruar, rikliko për ta hequr.",
    ],
  },
  {
    version: "1.299",
    date: "2026-08-16",
    notes: [
      "Rregullim vizual: te dritarja e fluturimit, datat e nisjes/mbërritjes dilnin të thyera në 3 rreshta — tani shfaqen horizontalisht në një rresht.",
    ],
  },
  {
    version: "1.298",
    date: "2026-08-16",
    notes: [
      "Rregullim: raporti PDF nga faqja e fluturimeve Offline kishte gjeneruesin e vet dhe nxirrte gjithmonë kolonat Bag/Google — tani edhe ai respekton filtrin e kolonave (nëse fsheh Bagazh ose Google, nuk dalin në PDF).",
    ],
  },
  {
    version: "1.297",
    date: "2026-08-16",
    notes: [
      "Dritarja e ndryshimit të fluturimit u ridizajnua si 'Boarding Pass': kokë blu me qytetet, oraret dhe numrin e fluturimit të editueshëm direkt, trup letre kremi me 2 kolona (fushat majtas | vendet + rezervimet djathtas).",
      "Vendet e lira tani mund të shkruhen me dorë ose të ndryshohen me butonat +/−; Total dhe shiriti i vendeve përditësohen automatikisht.",
      "Butoni i ruajtjes u bë 'Ruaj dhe Dil' — pas ruajtjes së suksesshme dritarja mbyllet vetë (përveç rastit kur kërkohet konfirmimi i ndryshimit të datës).",
    ],
  },
  {
    version: "1.296",
    date: "2026-08-16",
    notes: [
      "Raporti PDF i fluturimeve tani respekton filtrin e kolonave: nëse fsheh kolonën Bagazh ose Google në listë, ato nuk dalin më as në PDF.",
    ],
  },
  {
    version: "1.295",
    date: "2026-08-16",
    notes: [
      "Dritarja e ndryshimit të fluturimit u bë katrore dhe kompakte: dy kolona krah për krah (orari, vendet, çmimet | bagazhi, statusi, rezervimet), hapësira të reduktuara — pothuajse gjithçka shihet pa scroll.",
      "Gjenerimi i Excel-it tani bëhet në një proces të veçantë — sistemi nuk ndalet asnjë sekondë as gjatë rifreskimit të backup-it.",
    ],
  },
  {
    version: "1.294",
    date: "2026-08-16",
    notes: [
      "Rregullim shpejtësie: cache-i i shfletuesit nuk rritet më pafund (max 50 hyrje, skadim 24 orë) dhe kërkesat që përsëriten çdo minutë nuk ruhen më — sistemi nuk ngadalësohet me përdorimin e gjatë.",
      "Rregullim shpejtësie në server: Excel-i dhe Google Sheets sinkronizohen tani maksimumi një herë në 10 minuta (jo pas çdo veprimi) — shkarkimi i Excel-it nga raportet mbetet gjithmonë i freskët, butoni manual i Google Sheets punon menjëherë.",
    ],
  },
  {
    version: "1.293",
    date: "2026-08-15",
    notes: [
      "Rregull i ri te Cilësimet: \"Bagazhi Default për Fluturime të Reja\" — dritarja \"Fluturim i Ri\" e plotëson vetë bagazhin e kontrolluar (default 1 copë / 20 kg / 60 €).",
    ],
  },
  {
    version: "1.292",
    date: "2026-08-15",
    notes: [
      "Dritarja \"Fluturim i Ri\": buton \"Kërko nga Google\" — shfaq fluturimet e Google për rrugën/datën, kliko njërin dhe forma mbushet vetë; plus fusha opsionale \"Përsërit deri më...\" që krijon automatikisht të njëjtin fluturim në datat e tjera ku Google e gjen.",
    ],
  },
  {
    version: "1.291",
    date: "2026-08-15",
    notes: [
      "\"Kontrollo Çmime + Orare\" dhe \"Rifresko\" te Çmim i Ri tani punojnë në sfond me progres live (p.sh. \"Duke kontrolluar 23/85...\") — nuk ndalojnë më në mes me \"Gabim lidhje\" kur zgjasin shumë.",
    ],
  },
  {
    version: "1.290",
    date: "2026-07-31",
    notes: [
      "Dritarja e detajeve të rezervimit u ngjesh edhe më shumë: më pak hapësira vertikale te Informacion Klienti/Fluturimi, PNR & Çmimet, Shtojca Pasagjerëve dhe titulli — që gjithçka të shihet pa lëvizur poshtë.",
    ],
  },
  {
    version: "1.289",
    date: "2026-07-27",
    notes: [
      "U HOQ ndarja e vendeve në \"të konfirmuara\" dhe \"vende Google\" — kthehemi te NJË fushë e vetme vendesh që shënohet me dorë, siç ishte më parë.",
      "Vendet e konfirmuara që kishe shënuar u bashkuan automatikisht te totali i fluturimit (asnjë vend nuk humbi) dhe shenja ⭐ \"I konfirmuar\" kthehet si më parë — me zgjedhje manuale te formulari i fluturimit.",
      "Mbrojtjet kundër stuhisë së Sold Out mbeten të plota (radha e përbashkët e kërkimeve + injorimi i përgjigjeve bosh të Google-it).",
    ],
  },
  {
    version: "1.288",
    date: "2026-07-27",
    notes: [
      "Sold Out automatik u kthye siç ishte më parë: 3 mungesa radhazi në Google (~15 minuta me kontrollin çdo 5 min) — u hoq pritja shtesë ~2-orëshe.",
      "Mbrojtjet kundër stuhisë MBETEN: përgjigjet bosh të Google-it dhe kërkimet e dështuara nuk numërohen kurrë si mungesë vendesh, dhe të gjitha kërkimet kalojnë nga radha e përbashkët pa përplasje.",
    ],
  },
  {
    version: "1.287",
    date: "2026-07-27",
    notes: [
      "Kontrolli i vendeve u rikthye në çdo 5 minuta — tani i sigurt: të gjitha kërkimet drejt Google-it (kontrolli i vendeve, ri-kontrolli i shpejtë, çmimet, oraret) kalojnë nga një radhë e përbashkët me hapësirë mes thirrjeve, që të mos përplasen njëra me tjetrën.",
      "Përgjigjet BOSH të Google-it (shenjë mbingarkese e burimit) nuk numërohen më KURRË si \"s'ka vende\" — grupi ri-provohet dhe po dështoi, anashkalohet; fluturimet mbeten siç janë.",
      "Mbrojtje shtesë: nëse Google ndryshon formatin e përgjigjes, kontrolli ndalon së numëruari mungesa (në vend që të shpallë fluturime Sold Out gabimisht).",
    ],
  },
  {
    version: "1.286",
    date: "2026-07-27",
    notes: [
      "Kontrolli i vendeve nuk i nxjerr më fluturimet \"pa vende\" brenda pak minutash: mungesat në Google numërohen tani MAKSIMUMI një herë në orë, pra duhen të paktën ~2 orë mungesë e vazhdueshme (3 kontrolle radhazi) para se një fluturim të shpallet Sold Out. Një hop i shkurtër i Google-it s'i mbyll më shitjet masivisht.",
      "Intervali i kontrollit të vendeve u kthye nga 5 minuta në 60 minuta (e ndryshon te Cilësimet → Kontrolli i Vendeve).",
      "115 fluturimet që dolën gabimisht Sold Out sot pasdite (13:39–14:34) u rikthyen automatikisht siç ishin, me shënim në Historikun e Ndryshimeve.",
    ],
  },
  {
    version: "1.285",
    date: "2026-07-27",
    notes: [
      "Bllokimi i vendeve të Google tani i NGRIN vendet online te të shiturat (nuk i zeron): të shiturat mbeten gjithmonë të llogaritura dhe çdo vend i konfirmuar që shton del direkt tek Available — p.sh. 3 të shitura + 1 i konfirmuar ⇒ Available 1.",
      "Mbrojtje e re: shuma e vendeve (Google + të Konfirmuara) s'mund të ruhet më e vogël se vendet e shitura.",
    ],
  },
  {
    version: "1.284",
    date: "2026-07-27",
    notes: [
      "Buton i ri te paneli i fluturimit: \"🔒 Blloko vendet e Google\" — njësoj si bllokimi i vendeve të konfirmuara, ndalon shitjen e vendeve online derisa ta çaktivizosh vetë. Available/Total e pasqyrojnë menjëherë bllokimin.",
    ],
  },
  {
    version: "1.283",
    date: "2026-07-27",
    notes: [
      "U hoq butoni \"Fluturim i Konfirmuar\" — ylli ⭐, rreshti jeshil, tabi \"Të Konfirmuara\" dhe shenja te klienti tani dalin VETË sapo fluturimi i ka të gjitha vendet te \"Vende të Konfirmuara\" (Google = 0). Një burim i vetëm i së vërtetës: vendet.",
      "Fluturimet ekzistuese të shënuara \"I Konfirmuar\" u kaluan automatikisht në modelin e ri: vendet u zhvendosën te të Konfirmuarat, pamja dhe shitja mbeten njësoj.",
      "Kontrolli i vendeve nuk u vë më alarm \"pak vende\" fluturimeve tërësisht të konfirmuara.",
      "Numrat e vendeve tani tregojnë SHUMËN e vendeve online (Google) + të konfirmuarave: te \"Ulëse\" në detajet e rezervimit dhe te \"Volumi i Biletave\" (Available/Total) në panelin e fluturimit — s'del më \"0 / 0\" për fluturimet e konfirmuara.",
      "Te paneli i fluturimit u shtua fushë më vete \"Vendet e Google (online)\" — vendet e Google dhe të konfirmuarat plotësohen secila në fushën e vet, kurse Available/Total llogariten vetë.",
    ],
  },
  {
    version: "1.282",
    date: "2026-07-27",
    notes: [
      "U saktësua kuptimi i vendeve: vendet kryesore mbeten ato sipas Google (si gjithmonë), kurse fusha shtesë tani quhet \"Vende të Konfirmuara\" — bileta të blera paraprakisht që shtohen sipër dhe shiten edhe kur Google s'tregon vende (shenja jeshile \"+N ✓\").",
      "Kur kontrolli i Google s'gjen vende 3 herë radhazi: pa vende të konfirmuara fluturimi bëhet vetë Sold Out (si deri tani); me vende të konfirmuara mbyllen VETËM vendet e Google (shenja \"G🔒\") dhe shitja vazhdon me të konfirmuarat derisa të mbushen.",
      "Rihapja e vendeve të Google bëhet vetëm me dorë nga editimi i fluturimit; u hoq badge \"PAKONFIRMUAR\" te rezervimet — s'ka më xhep \"ekstra jo të konfirmuara\".",
    ],
  },
  {
    version: "1.281",
    date: "2026-07-26",
    notes: [
      "Vende EKSTRA jo të konfirmuara te fluturimet: fushë e re \"Vende Ekstra\" te krijimi dhe editimi i fluturimit — shiten si vendet normale dhe llogariten kudo (panel, booking-engine, Offline, API partnerësh).",
      "Bllokim automatik i ekstrave: kur kontrolli i Google s'gjen vende 3 herë radhazi, vendet ekstra bllokohen vetiu (shenja \"+N 🔒\" te lista e fluturimeve) dhe çbllokohen VETËM me dorë nga editimi.",
      "Badge i ri \"PAKONFIRMUAR ×N\" (ngjyrë qelibar) te rezervimet, vendet e të cilave ranë në xhepin ekstra — pastrohet vetiu sapo vendet hyjnë brenda të konfirmuarave (si MBISHITJE).",
    ],
  },
  {
    version: "1.280",
    date: "2026-07-26",
    notes: [
      "U hoq numri i njoftimeve nga menuja anësore: \"Njoftimet\" nuk shfaq më badge të kuq me numër (as në menunë e mbledhur) — faqja e njoftimeve mbetet e paprekur.",
    ],
  },
  {
    version: "1.279",
    date: "2026-07-26",
    notes: [
      "Fluturimet e kaluara përjashtohen automatikisht nga Google: shënimet e vjetra (\"Nuk ka X vende në Google\", \"S'gjendet - mundësi anulimi\") hiqen vetiu sapo fluturimi të ketë ikur — lista \"Past Flights\" dhe Njoftimet mbeten të pastra.",
    ],
  },
  {
    version: "1.278",
    date: "2026-07-26",
    notes: [
      "Shirit i kuq në krye të çdo faqeje me fluturimet ku kontrolli i Google gjeti më pak vende se pragu — shfaqet që në herën e parë (1/3), me linkun e fluturimit dhe numëruesin e humbjeve.",
    ],
  },
  {
    version: "1.277",
    date: "2026-07-25",
    notes: [
      "Shpejtësi: u aktivizua kompresimi gzip në server — listat e mëdha (Rezervimet, Fluturimet) shkarkohen ~85-90% më të vogla, faqet hapen dhe rifreskohen dukshëm më shpejt pas çdo ndryshimi.",
    ],
  },
  {
    version: "1.276",
    date: "2026-07-24",
    notes: [
      "Te \"Njoftime Importi\", klikimi i butonit \"Zgjidhur\" tani e heq njoftimin në vend, pa rifreskuar faqen dhe pa të kthyer lart — pozicioni dhe tab-i ku ndodhesh nuk ndryshojnë.",
    ],
  },
  {
    version: "1.275",
    date: "2026-07-24",
    notes: [
      "Faqja \"Njoftime Importi\" u nda në dy tabe: \"Njoftime\" (dështimet e vërteta të importit) dhe \"Bagazhet (luggages)\" — dosjet luggages_*.csv tani shfaqen vetëm në tab-in e tyre, si informative.",
      "Dosjet luggages_*.csv nuk numërohen më si njoftime: numëruesi i kuq në menunë anësore tregon vetëm dështimet e vërteta të importit.",
    ],
  },
  {
    version: "1.274",
    date: "2026-07-23",
    notes: [
      "Tabela e rezervimeve (tema Premium) tani përshtatet me gjerësinë e dritares: u hoq gjerësia minimale fikse dhe hapësirat e kolonave ngjeshen automatikisht, kështu të gjitha kolonat (deri te Statusi) shfaqen të plota edhe kur dritarja zvogëlohet.",
    ],
  },
  {
    version: "1.273",
    date: "2026-07-23",
    notes: [
      "Butonat e statusit te detajet e rezervimit (Anulo, Kthe në Pending/Draft/Konfirmuar, Konfirmo, Lësho Biletat, etj.) u bënë më të vegjël — tani zënë më pak vend dhe nuk bien në rreshtin e dytë kur statusi ka emër të gjatë.",
    ],
  },
  {
    version: "1.272",
    date: "2026-07-23",
    notes: [
      "Rregullim importi Offline: rezervimet nuk importoheshin kur numri i fluturimit në CSV vinte pa hapësirë (p.sh. 'W45102') ndërsa në sistem ishte ruajtur me hapësirë ('W4 5102'). Tani krahasimi bëhet i normalizuar (pa hapësira), kështu që importi e gjen fluturimin gjithmonë.",
    ],
  },
  {
    version: "1.271",
    date: "2026-07-23",
    notes: [
      "Rregullim 'Gabim lidhje' te 'Kontrollo Çmime + Orare': me shumë fluturime të zgjedhura (p.sh. 50), kontrolli zgjaste mbi 2 minuta dhe lidhja priej nga serveri para se të mbaronte — dilte 'Gabim lidhje' edhe pse kontrolli vazhdonte në sfond. Tani grupet rrugë+datë kontrollohen 5 paralelisht, kështu kontrolli mbaron shumë më shpejt dhe përgjigjja arrin brenda kohës.",
    ],
  },
  {
    version: "1.270",
    date: "2026-07-22",
    notes: [
      "Kontrolli i Vendeve: fluturimet që dalin PA vende mjaftueshëm në Google tani ri-kontrollohen SHPEJT — brenda max 5 minutash (jo në ciklin e radhës të intervalit). Kështu konfirmimi 3 herë radhazi dhe Sold Out automatik ndodh brenda ~10-15 minutash në vend të ~1 ore.",
    ],
  },
  {
    version: "1.269",
    date: "2026-07-22",
    notes: [
      "Kontrolli i Vendeve: u rregullua problemi ku disa fluturime mbeteshin PA kontroll — kur Google API dështonte për një rrugë+datë, grupi kapërcehej pa riprovë (natën e fundit deri në 12 grupe të kapërcyera). Tani çdo grup riprovohet deri në 3 herë me pauzë, dhe çdo kërkesë ka timeout 25 sekonda që lidhjet e ngecura të mos e bllokojnë kontrollin.",
    ],
  },
  {
    version: "1.268",
    date: "2026-07-21",
    notes: [
      "Korrigjim: kutia \"Mbyllja e Shitjes (End Selling Time)\" te Cilësimet u HOQ për menaxherin (mbetet vetëm për adminin). Menaxheri e ndryshon orën e mbylljes së shitjes vetëm kur hap një fluturim, te kutia \"Sales Ending\" e panelit të fluturimit.",
    ],
  },
  {
    version: "1.267",
    date: "2026-07-21",
    notes: [
      "Cilësimet: vlerën globale \"Mbyllja e Shitjes (End Selling Time)\" tani mund ta ndryshojë edhe MENAXHERI, jo vetëm admini. Menaxheri mund të ndryshojë edhe orën për fluturim te paneli i fluturimit (siç u hap te v1.266).",
    ],
  },
  {
    version: "1.266",
    date: "2026-07-21",
    notes: [
      "Fluturimet: kutia \"Sales Ending\" (ora e mbylljes së shitjes / Stop selling) tani i shfaqet edhe menaxherit te ÇDO fluturim. Më parë vlera globale lexohej vetëm nga admini, prandaj menaxherit i dilte vetëm te fluturimet që kishin orë të veçantë të vendosur.",
    ],
  },
  {
    version: "1.265",
    date: "2026-07-21",
    notes: [
      "Njoftimet: buton \"✓ Lexuar\" për ÇDO njoftim veç e veç — pas klikimit njoftimi HIQET fare nga lista (jo vetëm zbehet) dhe nuk numërohet më te numëruesit. Butoni i seksionit u riemërua \"Shëno të gjitha të lexuara\" dhe i heq të gjitha njëherësh. Vlen për të 4 seksionet: Mbyllje shitjeje, Alarme fluturimesh, Sold Out, Ndryshime orari.",
    ],
  },
  {
    version: "1.264",
    date: "2026-07-21",
    notes: [
      "Njoftimet: butoni \"Shëno të lexuar\" tani në TË GJITHA seksionet e faqes — \"Mbyllje shitjeje së shpejti\", \"Alarme fluturimesh (vende & orare)\" dhe \"Ndryshime orari\" (përveç Sold Out që e kishte). Njoftimet e lexuara shfaqen të zbehta, numëruesit e seksioneve dhe numëruesi i kuq te menyja \"Njoftimet\" numërojnë vetëm të palexuarat; nëse një alarm ndryshon (p.sh. orar i ri), njoftimi rikthehet si i palexuar.",
    ],
  },
  {
    version: "1.263",
    date: "2026-07-21",
    notes: [
      "Njoftimet: buton i ri \"Shëno të lexuar\" te seksioni \"Sapo dolën Sold Out\" — pas klikimit, njoftimet ekzistuese shënohen si të lexuara (shfaqen të zbehta), numëruesi i seksionit dhe numëruesi i kuq në meny bien menjëherë; vetëm Sold Out-et E REJA rikthejnë numëruesin.",
    ],
  },
  {
    version: "1.262",
    date: "2026-07-21",
    notes: [
      "Njoftimet: seksion i ri \"Sapo dolën Sold Out (48 orët e fundit)\" — shfaq çdo fluturim që sapo kaloi në Sold Out, nga çdo rrugë (mbushja e vendeve nga shitjet, kontrolli automatik i Google, afati i shitjes, ose ndryshim manual nga një përdorues), me detaje të zgjerueshme (vendet, arsyeja, ora, kush e bëri).",
      "Numëruesi i kuq i \"Njoftimet\" në meny tani përfshin edhe fluturimet e reja Sold Out.",
    ],
  },
  {
    version: "1.261",
    date: "2026-07-21",
    notes: [
      "Faqja 'Njoftimet': çdo njoftim tani hapet brenda faqes (klik mbi rresht) me detaje të plota — kompania, oraret, vendet, detajet e alarmit nga Google dhe koha e kontrollit; lidhjet për te fluturimi janë opsionale brenda detajit.",
    ],
  },
  {
    version: "1.260",
    date: "2026-07-21",
    notes: [
      "Faqja 'Përdoruesit': buton i ri ✏️ për ndryshimin e të dhënave të login-it (email, emër, kompani, telefon) për çdo përdorues; kontroll që emaili të mos përsëritet.",
    ],
  },
  {
    version: "1.259",
    date: "2026-07-21",
    notes: [
      "Faqja 'Njoftimet': hiqet seksioni 'Njoftime importi' (mbetet faqja e vet te menuja); numëruesi i menusë tani numëron vetëm alarmet e fluturimeve dhe ndryshimet e orarit.",
    ],
  },
  {
    version: "1.258",
    date: "2026-07-21",
    notes: [
      "Faqe e re 'Njoftimet' në menunë anësore: të gjitha njoftimet e sistemit në një vend — mbyllje shitjeje së shpejti, alarme vendesh/oraresh nga Google, ndryshime orari në pritje dhe njoftime importi.",
      "Numëruesi i kuq te 'Njoftimet' tregon totalin e njoftimeve aktive; faqja rifreskohet vetë çdo minutë.",
    ],
  },
  {
    version: "1.257",
    date: "2026-07-18",
    notes: [
      "Historiku i Ndryshimeve të fluturimit tani shënon edhe kalimet AUTOMATIKE në Sold Out (etiketë e kuqe 'Automatik', përdoruesi 'Sistemi').",
      "Regjistrohen të tre rastet: kur nuk gjenden vende në Google (kontrolli i vendeve), kur mbushen të gjitha vendet, dhe kur kalon afati i shitjes (sell cutoff).",
    ],
  },
  {
    version: "1.256",
    date: "2026-07-18",
    notes: [
      "Buton i ri 'Shëno si të lexuar' te njoftimet e ndryshimit të fluturimit (banner-i i kuq te detajet e rezervimit).",
      "Pas leximit, alarmi i kuq dhe filtri 'Me njoftim' nuk e shfaqin më rezervimin — derisa të vijë një email i ri njoftimi.",
      "Njoftimet e lexuara mbeten të dukshme si historik gri me link-un e PDF-së.",
    ],
  },
  {
    version: "1.255",
    date: "2026-07-18",
    notes: [
      "Njoftimet e ndryshimit të fluturimit nga emaili: kur vjen email 'Important changes to your flight' me PNR që ekziston në sistem, rezervimi shënjohet me alarm të kuq (ikonë sirene) te lista e Rezervimeve.",
      "Filtër i ri 'Me njoftim / Pa njoftim' te faqja e Rezervimeve (klasike dhe premium).",
      "Emaili i njoftimit ruhet automatikisht si PDF te rezervimi — shfaqet si banner i kuq me link 'Emaili (PDF)' te detajet e rezervimit.",
      "Kontrolli bëhet automatikisht çdo 30 minuta bashkë me skanimin e biletave nga emaili.",
    ],
  },
  {
    version: "1.254",
    date: "2026-07-17",
    notes: [
      "U hoq emri i partnerit të jashtëm nga të gjitha tekstet e dukshme të sistemit (përshkrimi i 'Blloko shitjet e jashtme', njoftimet e bllokimit masiv dhe historiku i versioneve) — zëvendësuar me 'kanalet e jashtme'.",
    ],
  },
  {
    version: "1.253",
    date: "2026-07-17",
    notes: [
      "Historiku i Vendeve dhe Historiku i Ndryshimeve tani tregojnë për çdo ngjarje gjendjen e plotë: Total · Shitur · Gjendje (vendet e lira pas ngjarjes).",
    ],
  },
  {
    version: "1.252",
    date: "2026-07-17",
    notes: [
      "Fshirja e fluturimeve tani bllokohet edhe kur fluturimi ka taska të lidhura — jo vetëm rezervime.",
      "Njoftimi pas fshirjes masive tregon listën e plotë të fluturimeve që nuk u fshinë dhe arsyen e saktë për secilin (rezervime aktive, të anuluara, taska).",
    ],
  },
  {
    version: "1.251",
    date: "2026-07-17",
    notes: [
      "Fshirja masive e fluturimeve u bë e zgjuar: fshihen të gjitha fluturimet pa rezervime, ndërsa ato me rezervime (edhe të anuluara) mbeten dhe tregohen qartë me arsyen (numri i rezervimeve).",
      "Njoftimi i gabimit të fshirjes tani është i qartë në shqip — jo më mesazh teknik i databazës.",
      "Pas fshirjes masive, fluturimet që nuk u fshinë dot mbeten të selektuara për verifikim të lehtë.",
    ],
  },
  {
    version: "1.250",
    date: "2026-07-17",
    notes: [
      "Pagesat POK (me kartë online) tani dërgojnë automatikisht email me faturën PDF (INV-...) te agjenti dhe administrata, njësoj si pagesat manuale dhe masive.",
    ],
  },
  {
    version: "1.249",
    date: "2026-07-16",
    notes: [
      "Menuja anësore tani thekson saktë linqet 'Fluturime të Bllokuara' dhe 'Fluturime të Konfirmuara' kur je te ajo faqe (ndryshon ngjyra), dhe 'Fluturimet' nuk theksohet gabimisht në atë rast.",
    ],
  },
  {
    version: "1.248",
    date: "2026-07-16",
    notes: [
      "Skeda 'Të Konfirmuara' u hoq nga faqja kryesore e fluturimeve — tani hapet vetëm nga linku i menusë 'Fluturime të Konfirmuara' (⭐).",
    ],
  },
  {
    version: "1.247",
    date: "2026-07-16",
    notes: [
      "Link i ri në menunë anësore: 'Fluturime të Konfirmuara' (⭐) — hap faqen e fluturimeve direkt te skeda 'Të Konfirmuara' (/flights?tab=booked), me të gjitha filtrat dhe funksionet njësoj si faqja kryesore (admin/manager).",
    ],
  },
  {
    version: "1.246",
    date: "2026-07-16",
    notes: [
      "Filtër i ri te faqja 'Fluturimet': 'Shitjet e jashtme' (Të gjitha / Hapura jashtë / Bllokuara jashtë) — filtrimi bëhet në server dhe 'Zgjidh të gjitha' nëpër faqe e respekton filtrin.",
      "Link i ri në menunë anësore: 'Fluturime të Bllokuara' (vetëm admin/menaxher) — hap faqen e fluturimeve me filtrin 'Bllokuara jashtë' të para-zgjedhur; të gjitha opsionet e tjera të faqes mbeten të disponueshme.",
    ],
  },
  {
    version: "1.245",
    date: "2026-07-16",
    notes: [
      "Funksion i ri: 'Blloko shitjet e jashtme' — fluturimet e bllokuara shfaqen TË MBYLLUR / pa vende në faqen publike (booking-engine), API-në e partnerëve dhe kanalet e jashtme, ndërsa rezervimet nga sistemi i brendshëm vazhdojnë normalisht.",
      "Bllokim/hapje masive nga lista e fluturimeve: butonat '🔒 Blloko Jashtë' dhe '🔓 Hap Jashtë' te shiriti i veprimeve masive (vetëm admin/menaxher).",
      "Bllokim individual: kutia '🔒 Blloko shitjet e jashtme' te paneli anësor i fluturimit (seksioni Statusi).",
      "Fluturimet e bllokuara shënohen me etiketën portokalli '🔒 I bllokuar jashtë' te lista e fluturimeve.",
    ],
  },
  {
    version: "1.244",
    date: "2026-07-16",
    notes: [
      "Karta 'Informacion Fluturimi' te detajet e rezervimit u ristrukturua me pamje premium: të dhënat e fluturimit (fluturimi, rruga, nisja, mbërritja, kohëzgjatja, statusi, ulëset) qëndrojnë LART, ndërsa seksioni i Google (çmimet + përditësimi admin) POSHTË, i ndarë me vijë.",
      "Statusi 'Open' shfaqet tani me kuti jeshile të dallueshme; 'Sold Out' me kuti të kuqe dhe 'I Mbyllur' me kuti gri.",
    ],
  },
  {
    version: "1.243",
    date: "2026-07-15",
    notes: [
      "Historiku i Ndryshimeve të fluturimit tani tregon edhe lëvizjet e vendeve: shitjet (sa vende u shitën), anulimet dhe rikthimet, me referencën e rezervimit përkatës dhe sa vende mbeten të lira pas çdo ngjarjeje — të bashkuara në një kronologji të vetme me editimet.",
    ],
  },
  {
    version: "1.242",
    date: "2026-07-15",
    notes: [
      "Kontroll integriteti për biletat Wizz të ruajtura: nëse skedari PDF i një bilete të ruajtur nuk gjendet më në sistem, bileta hiqet automatikisht, del njoftimi 'nuk u gjet' si për biletat e tjera, shënohet arsyeja te Historiku, dhe kërkimi në email rifillon nga e para.",
      "Kontrolli kryhet automatikisht çdo 30 minuta nga skaneri periodik dhe gjithashtu sa herë hapet/kërkohet bileta e një rezervimi.",
    ],
  },
  {
    version: "1.241",
    date: "2026-07-15",
    notes: [
      "Email-et e ndryshimit të orarit dërgohen tani VEÇ E VEÇ për çdo rezervim — jo më të gjitha rezervimet e një marrësi në një email të vetëm. Subjekti i çdo email-i përmban referencën e rezervimit përkatës.",
      "Kopja përmbledhëse për administratën liston çdo email të dërguar për rezervim.",
    ],
  },
  {
    version: "1.240",
    date: "2026-07-15",
    notes: [
      "Bileta Wizz e ruajtur ndjek statusin e rezervimit: kur statusi kthehet nga 'Ticketed' në 'Konfirmuar' (ose status tjetër jo-anulim), bileta e ruajtur (PDF) hiqet automatikisht bashkë me skedarët.",
      "Kur rezervimi bëhet përsëri 'Ticketed', kërkimi i biletës në email rifillon NGA E PARA me të dhënat aktuale të sistemit (orari i ri i fluturimit përfshirë) — nuk rikthehet kurrë bileta e vjetër.",
      "Heqja e biletës regjistrohet në Historikun e rezervimit.",
    ],
  },
  {
    version: "1.239",
    date: "2026-07-15",
    notes: [
      "Etiketa 'MBISHITJE' hiqet automatikisht: kur shtohen vende në fluturim dhe mbishitja zgjidhet (vendet e shitura futen brenda kapacitetit), shënimi [MBISHITJE] fshihet vetvetiu nga rezervimet përkatëse — si te ndryshimi i një fluturimi, ashtu edhe te ndryshimi masiv i vendeve.",
    ],
  },
  {
    version: "1.238",
    date: "2026-07-15",
    notes: [
      "Importet Offline nuk humbin më të dhëna: kur një dosje CSV dështon në import, përmbajtja e saj e plotë ruhet te 'Njoftime Importi' dhe mund të shkarkohet me butonin 'Shkarko CSV' — edhe pse dosja origjinale fshihet nga serveri i partnerit.",
      "Mbishitja nuk bllokon më importin: nëse një rezervim vjen për një fluturim pa vende të lira, ai importohet GJITHSESI (asnjë pasagjer s'humbet) dhe shënohet me etiketën e kuqe 'MBISHITJE' te lista e rezervimeve dhe te detajet e rezervimit, plus krijohet një njoftim për administratorët.",
      "Disponibiliteti që i dërgohet partnerit nuk bie kurrë nën 0 edhe kur fluturimi është mbi kapacitet.",
    ],
  },
  {
    version: "1.237",
    date: "2026-07-15",
    notes: [
      "Lidhja SFTP me kanalin Offline u bë më e qëndrueshme: sistemi bën 3 tentativa lidhjeje brenda çdo cikli (në vend të 1), kështu që dështimet e rastësishme kalimtare nuk shkaktojnë më gabim.",
      "Email-i i kuq 'Lidhja SFTP dështoi' dërgohet tani VETËM pas 3 cikleve të dështuara rresht (shkëputje reale), jo për çdo dështim të vetëm — zhduken alarmet e rreme që vinin disa herë në ditë.",
      "U fik importi i rezervimeve me email (Gmail IMAP) — ishte i prishur prej muajsh (kredenciale të pavlefshme) dhe gjithçka vjen tashmë nga SFTP.",
    ],
  },
  {
    version: "1.236",
    date: "2026-07-15",
    notes: [
      "Rresht i kuq njoftimi lart në çdo faqe të sistemit: lista e fluturimeve që do të kalojnë në 'End Selling' (mbyllje automatike e shitjes) brenda 1 ore, me minutat e mbetura dhe orën e mbylljes.",
      "Njoftimi mbyllet me X dhe rishfaqet automatikisht kur kalon në një faqe tjetër; rifreskohet vetë çdo minutë. Klikimi mbi fluturim të çon te detajet e tij.",
    ],
  },
  {
    version: "1.235",
    date: "2026-07-15",
    notes: [
      "Email njoftimi për ÇDO hyrje në sistem — si nga faqja e jashtme (Booking) ashtu edhe nga faqja e brendshme e menaxhimit — për çdo rol (admin, menaxher, staf, agjent, klient).",
      "Email-i i hyrjes tani tregon: faqen nga u bë hyrja, emrin, email-in, rolin, kompaninë/agjencinë, orën, IP-në reale dhe pajisjen (browser-in).",
    ],
  },
  {
    version: "1.234",
    date: "2026-07-15",
    notes: [
      "Raporti ditor i pasagjerëve me PDF në email tani vjen në orën 00:01 — sapo mbaron dita — në vend të orës 06:00 të mëngjesit.",
      "Raporti tani përmban pasagjerët e DITËS QË SAPO PËRFUNDOI (dita e kaluar), me titull \"Pasagjerët e Ditës\" dhe datën përkatëse — jo më pasagjerët e ditës së re.",
    ],
  },
  {
    version: "1.233",
    date: "2026-07-15",
    notes: [
      "Numëruesi \"Pa Email\" tani bëhet JESHIL kur numri është 0 — gjithçka në rregull, të gjitha biletat Wizz janë gjetur nga emaili. Ngjyrat: jeshil = 0, gri = 1, i kuq = më shumë se 1.",
    ],
  },
  {
    version: "1.232",
    date: "2026-07-15",
    notes: [
      "Numëruesi \"Pa Email\" te lista e rezervimeve (pamja premium) tani bëhet I KUQ kur numri është më i madh se 1 — që të bjerë menjëherë në sy kur ka shumë bileta Wizz ende pa u gjetur nga emaili. Me 0 ose 1 mbetet gri si më parë.",
    ],
  },
  {
    version: "1.231",
    date: "2026-07-15",
    notes: [
      "Mbrojtje e re: kur ndryshohet DATA e nisjes së një fluturimi që ka rezervime aktive, sistemi ndalon dhe kërkon konfirmim të qartë. Dialogu tregon datën e vjetër → të re dhe sa rezervime e pasagjerë do të zhvendosen bashkë me fluturimin.",
      "Paralajmërim në dialog: nëse bëhet fjalë për një fluturim TJETËR (jo i njëjti fluturim që ndryshoi datë nga kompania), duhet krijuar fluturim i ri në vend që të ndryshohet data — kështu shmangen rastet kur pasagjerët përfundojnë në datë të gabuar pa u vënë re.",
      "Mbrojtja vlen për të gjitha rezervimet (manuale, të agjentëve, të importuara nga CP) dhe zbatohet në server — asnjë ndryshim date me rezervime aktive nuk kalon pa konfirmim.",
    ],
  },
  {
    version: "1.230",
    date: "2026-07-14",
    notes: [
      "Njoftim me email për ÇDO ndryshim fluturimi: krijim, modifikim, ndryshim masiv, import, dublikim, hapje/mbyllje shitjesh, sinkronizim orari dhe fshirje. Email-i tregon fluturimin (numri, rruga, data, kodi #), kush e bëri ndryshimin, kur, dhe tabelën e fushave të ndryshuara (Para → Pas).",
      "Ndryshimet grumbullohen për 60 sekonda dhe dërgohen si NJË email i vetëm — kështu ndryshimet masive (p.sh. 50 fluturime njëherësh) nuk mbushin inbox-in me email-e veç e veç.",
      "Kodi i fluturimit (#ID) tani shfaqet kur hapet fluturimi: te paneli i fluturimit (pranë rrugës lart) dhe te faqja e detajit të fluturimit.",
    ],
  },
  {
    version: "1.229",
    date: "2026-07-14",
    notes: [
      "Faqja e Rezervimeve: çdo kolonë e tabelës (Data Rez., REF, PNR, Klienti, Agjencia, Fluturimi, PAX, Financa, Statusi) tani renditet me klikim mbi titullin — klikimi i parë rritëse, i dyti zbritëse, i treti kthen renditjen normale (më të rejat lart).",
      "Renditja zbatohet mbi GJITHË listën e filtruar (jo vetëm faqen e dukshme) dhe vlerat bosh dalin gjithmonë në fund.",
    ],
  },
  {
    version: "1.228",
    date: "2026-07-14",
    notes: [
      "Kërkimet e biletës në email tani lënë gjurmë të përhershme te Historiku i rezervimit: sa herë që rezultati i kërkimit ndryshon (p.sh. \"pasagjeri nuk u gjet në email\"), shënimi ruhet si hyrje \"Kërkim Bilete në Email\" dhe mbetet i kërkueshëm edhe pasi bileta gjendet më vonë — kështu gjithmonë shihet çfarë ka ndodhur me PNR-in.",
      "Riprovat e përsëritura automatike me të njëjtin rezultat nuk e mbushin historikun — regjistrohet vetëm kur mesazhi ndryshon.",
    ],
  },
  {
    version: "1.227",
    date: "2026-07-14",
    notes: [
      "Lejet \"Dyfisho fluturimet\" dhe \"Fshi fluturimet\" tani zbatohen plotësisht edhe në server: përdoruesit pa këto leje nuk mund të dublikojnë apo fshijnë fluturime (as me kërkesa direkte), përfshirë fshirjen masive.",
      "Menaxheri e ka tani të çaktivizuar si parazgjedhje dublikimin e fluturimeve (mund të ndizet te Cilësimet → Lejet e Përdoruesve).",
      "Butonat Dyfisho/Fshi te lista e fluturimeve shfaqen vetëm për përdoruesit që kanë lejen përkatëse.",
    ],
  },
  {
    version: "1.226",
    date: "2026-07-14",
    notes: [
      "Historik i plotë i ndryshimeve për çdo fluturim: buton i ri \"Historiku\" në krye të dritares së fluturimit që tregon çdo ngjarje — krijim, editim, sinkronizim orari, dublikim, ndryshime masive, hap/mbyll shitjet, çmim Offline, zgjatje kalendari dhe import Excel — me përdoruesin, datën/orën dhe çdo fushë të ndryshuar (vlera e vjetër → e re).",
      "Dublikimi i fluturimit tani lë gjurmë në të dy fluturimet: kopja e re tregon nga cili fluturim u krijua, dhe origjinali tregon cilin fluturim krijoi.",
    ],
  },
  {
    version: "1.225",
    date: "2026-07-14",
    notes: [
      "Kërkimi i biletës Wizz në email tani lexon edhe email-et në gjermanisht (\"Ihre Reiseroute\") — më parë lexoheshin vetëm ato në anglisht, prandaj disa bileta nuk gjendeshin edhe pse pasagjeri ishte në email. Mjafton që pasagjeri i kërkuar të jetë në biletë (personat e tjerë shtesë në të njëjtin email nuk pengojnë).",
    ],
  },
  {
    version: "1.224",
    date: "2026-07-14",
    notes: [
      "Rezultati i kërkimit të biletës në email tani ruhet si shënim i përhershëm te detajet e rezervimit, në një kuti afër butonit \"Kërko Biletën në Email\" (me datën/orën e kërkimit të fundit) — jo më vetëm si njoftim kalimtar. Ruhet si për kërkimin manual ashtu edhe për atë automatik.",
    ],
  },
  {
    version: "1.223",
    date: "2026-07-14",
    notes: [
      "Sinjalizim i ri te lista e rezervimeve: kur një rezervim ka shënime brenda, në rresht del një shenjë e verdhë me numrin e shënimeve (në të gjitha pamjet — klasike/premium, desktop/celular).",
    ],
  },
  {
    version: "1.222",
    date: "2026-07-14",
    notes: [
      "Kutia \"Shënime\" u zhvendos brenda kartës \"Informacion Klienti\" (poshtë Agjencisë) te detajet e rezervimit. Kur ka shumë shënime, lista ka lartësi të kufizuar dhe rrotullohet me mouse (scroll).",
    ],
  },
  {
    version: "1.221",
    date: "2026-07-14",
    notes: [
      "Hapësirë e re \"Shënime\" brenda çdo rezervimi: shkruaj direkt dhe dërgo me Enter. Shënimet dalin me ngjyra të dallueshme sipas autorit, nuk mund të ndryshohen pas dërgimit, dhe çdo shënimi mund t'i bëhet Reply (shkruaj dhe shtyp Enter përsëri).",
    ],
  },
  {
    version: "1.220",
    date: "2026-07-14",
    notes: [
      "Numëruesit \"Pa Email\" / \"Me Email\" te lista e rezervimeve tani tregojnë GJITHMONË totalin e gjithë sistemit — nuk ndikohen nga filtri i datës (sot / 7 ditë / 30 ditë / interval manual), statusi apo agjenti. Kur klikon njërin numërues, lista shfaq të gjitha ato rezervime nga i gjithë sistemi, që numri të përputhet gjithmonë me listën.",
    ],
  },
  {
    version: "1.219",
    date: "2026-07-14",
    notes: [
      "Kërkimi i biletave Wizz në email u përmirësua: lexohen saktë email-et me emra aeroportesh me kllapa (p.sh. \"Pisa (Tuscany) (PSA)\"), dhe kur për të njëjtin PNR kanë ardhur disa email-e (p.sh. pas ndryshimit të fluturimit), kontrollohen të gjithë dhe ruhet ai që përputhet me fluturimin e rezervimit — jo thjesht më i riu.",
    ],
  },
  {
    version: "1.218",
    date: "2026-07-14",
    notes: [
      "Lista e rezervimeve (pamja premium): dy numërues të rinj lart me simbolin e biletës — \"Pa Email: N\" (gri, bileta Wizz ende pa u gjetur nga emaili) dhe \"Me Email: N\" (rozë, bileta të gjetura). Kliko njërin për të filtruar listën vetëm me ato rezervime; kliko sërish për ta hequr filtrin.",
    ],
  },
  {
    version: "1.217",
    date: "2026-07-14",
    notes: [
      "Butoni \"Përjashto nga Kërkimi në Email\" u zëvendësua me një buton të vogël me kuti check-u (\"Përjashto nga Emaili\") te detajet e rezervimit — i çek-uar kur rezervimi është i përjashtuar; kliko për ta hequr ose rikthyer.",
    ],
  },
  {
    version: "1.216",
    date: "2026-07-14",
    notes: [
      "Buton i ri \"Përjashto nga Kërkimi në Email\" te detajet e rezervimit (pranë butonit \"Kërko Biletën në Email\"): rezervimi i përjashtuar s'kërkohet më nga skaneri automatik as manualisht, dhe s'i del asnjë shenjë (badge) te lista e rezervimeve. Mund të rikthehet me një klik (\"Rikthe Kërkimin në Email\"). Veprimi ruhet edhe në historikun e ndryshimeve të rezervimit.",
    ],
  },
  {
    version: "1.215",
    date: "2026-07-14",
    notes: [
      "Lista e rezervimeve: badge i biletave (rozë N/N ose gri 0/N) tani shfaqet në krah, djathtas statusit (p.sh. Ticketed), jo poshtë tij — në të dyja pamjet (klasike dhe premium), desktop dhe mobil.",
    ],
  },
  {
    version: "1.214",
    date: "2026-07-14",
    notes: [
      "Lista e rezervimeve: badge GRI 0/N te rezervimet Wizz \"Ticketed\" me PNR ku bileta ende s'është gjetur nga emaili — tani dallohet menjëherë kujt i mungon bileta, jo vetëm kush e ka (rozë N/N).",
      "Skaneri automatik i biletave (çdo 30 min) u përmirësua: kontrollon 20 rezervime për cikël (më parë 8) — 10 më të rejat me prioritet + 10 të rastësishme nga radha, që edhe rezervimet e vjetra të kontrollohen me kohë (më parë pa renditje — shumë s'kontrolloheshin kurrë).",
    ],
  },
  {
    version: "1.213",
    date: "2026-07-14",
    notes: [
      "Lista e rezervimeve: badge i ri ROZË pranë statusit që tregon sa bileta janë gjetur nga emaili dhe janë ruajtur (p.sh. 1/1, 2/2 — një për çdo PNR). Shfaqet në të dyja pamjet (klasike dhe premium), desktop dhe mobil.",
    ],
  },
  {
    version: "1.212",
    date: "2026-07-14",
    notes: [
      "Bileta Wizz me SHUMË PNR: kur një rezervim ka disa PNR (p.sh. dy PNR me pasagjerë të ndarë), kërkimi në email bëhet për çdo PNR veçmas — me emrat e pasagjerëve të atij PNR-i. Ruhet një PDF për çdo PNR dhe te detajet e rezervimit shfaqet një buton shkarkimi për secilën biletë (me PNR-in përkatës).",
      "Ruajtja bëhet vetëm kur TË GJITHA biletat gjenden dhe përputhen — asnjë gjendje gjysmake.",
    ],
  },
  {
    version: "1.211",
    date: "2026-07-14",
    notes: [
      "Bileta Wizz (PDF) tani përmban VETËM pjesën e biletës — logo, kodi i konfirmimit, pasagjerët dhe detajet e fluturimit — pa reklamat poshtë (Booking.com, makina me qira, banera). Një faqe e vetme e pastër.",
    ],
  },
  {
    version: "1.210",
    date: "2026-07-14",
    notes: [
      "Bileta Wizz (PDF) tani është kopje IDENTIKE e email-it të Wizzair — me logon, ngjyrat dhe layout-in origjinal. PDF-ja gjenerohet duke renderuar HTML-në e vërtetë të email-it të konfirmimit, jo më si dokument i thjeshtë.",
      "Biletat e ruajtura më parë (me formatin e vjetër) do të rigjenerohen automatikisht me pamjen e re nga skaneri.",
    ],
  },
  {
    version: "1.209",
    date: "2026-07-14",
    notes: [
      "Bileta Wizz nga email-i: kur një rezervim Wizzair kalon në \"Biletuar\", sistemi kërkon automatikisht në inbox-in e biletave email-in e konfirmimit (\"Your travel itinerary\"), krahason TË GJITHA detajet (PNR, pasagjerët, numrin e fluturimit, aeroportet, datën dhe orarin) dhe, nëse gjithçka përputhet, e ruan si PDF te rezervimi (etiketa rozë \"Bileta Wizz (PDF)\" te detajet).",
      "Buton i ri \"Kërko Biletën në Email\" te detajet e rezervimit (për rezervimet e biletuara Wizz pa biletë të ruajtur) + skaner automatik çdo 30 minuta për email-et që vijnë me vonesë.",
    ],
  },
  {
    version: "1.208",
    date: "2026-07-14",
    notes: [
      "Historiku i Vendeve te fluturimi (Volumi i Biletave → Historiku): regjistrohet çdo vendosje/ndryshim i numrit të vendeve, çdo shitje, anulim dhe rikthim — me datë, përdorues dhe vendet e mbetura pas çdo ngjarjeje.",
    ],
  },
  {
    version: "1.207",
    date: "2026-07-13",
    notes: [
      "Eksporti i listës së Rezervimeve (Excel + PDF): kolona \"Fluturimi\" u nda në dy kolona të veçanta — \"Nisja\" dhe \"Mbërritja\".",
    ],
  },
  {
    version: "1.206",
    date: "2026-07-13",
    notes: [
      "Raporti \"Detyrimet\" (PDF + Excel te Agjentët): kolona \"Fluturimi\" u nda në dy kolona të veçanta — \"Nisja\" dhe \"Mbërritja\".",
      "Te Excel-i i Detyrimeve u shtua edhe kolona \"Linja\" (linja ajrore + numri i fluturimit), që më parë ishte e përzier me rrugën.",
    ],
  },
  {
    version: "1.205",
    date: "2026-07-13",
    notes: [
      "Kodi CP (Offline) tani përfshihet KUDO në shkarkimet e raporteve për agjencinë ONLINE TRAVEL: kolonë e re \"Kodi CP\" te eksporti Excel + PDF i listës së Rezervimeve, te raportet e agjentëve (Detyrimet / Raport i Detajuar — PDF + Excel), te \"Shkarko PDF\" i Raportit të Biletave dhe te \"Raport i Detajuar – Pagesat\".",
      "Kolona shfaqet automatikisht vetëm kur raporti përmban rezervime ONLINE TRAVEL me kod CP — raportet e agjencive të tjera mbeten të pandryshuara.",
    ],
  },
  {
    version: "1.204",
    date: "2026-07-13",
    notes: [
      "U rikthyen email-et e dështimeve të importit Offline (\"⚠️ Rezervime nuk u importuan\" dhe \"🔴 Lidhja SFTP dështoi\") — njoftimet tani vijnë EDHE në email EDHE në sistem te \"Njoftime Importi\".",
      "Email-i i suksesit \"✅ Offline: N rezervime të reja\" rikthen listën e detajuar të gabimeve kur ka të tilla.",
    ],
  },
  {
    version: "1.203",
    date: "2026-07-13",
    notes: [
      "Email-et e dështimeve të importit Offline (\"⚠️ Rezervime nuk u importuan\" dhe \"🔴 Lidhja SFTP dështoi\") NUK dërgohen më — dështimet shfaqen vetëm si njoftime në sistem te faqja \"Njoftime Importi\".",
      "Email-i i suksesit \"✅ Offline: N rezervime të reja\" vazhdon të vijë si më parë; nëse ka pasur gabime, tregon vetëm numrin e tyre me referencë te \"Njoftime Importi\".",
    ],
  },
  {
    version: "1.202",
    date: "2026-07-13",
    notes: [
      "Kolona \"Pagesa\" në raportet e agjentit (Raport i Detajuar + Raport Detyrimet + eksporti Excel) tani shfaq edhe shumën e secilës pagesë krahas mënyrës dhe datës (p.sh. \"Bankë 12/07 €50 + Cash 13/07 €30\"; rimbursimet me minus).",
      "Të gjitha mënyrat e pagesës që janë CASH (edhe ato me emra të personalizuar në sistem) shfaqen vetëm si \"Cash\" në raporte, email-et e pagesave dhe PDF-të e faturave.",
    ],
  },
  {
    version: "1.201",
    date: "2026-07-13",
    notes: [
      "Email-i i pagesës që i dërgohet agjentit (dhe adminit) u ridizajnua me formatin e ri kompakt të raportit: një rresht për rezervim me Rezervimi, PNR, Klienti, Fluturimi, Pagesa e sapokryer (mënyra + data + shuma), Total, Paguar dhe Detyrim — me detyrimin e mbetur të dukshëm lart.",
      "Edhe email-i i pagesës masive (shumë bileta njëherësh) përdor të njëjtin format me një rresht për çdo biletë dhe rreshtin TOTALI në fund.",
      "PDF-ja e faturës vazhdon të vijë e bashkëngjitur si më parë; rimbursimet shfaqen si \"Notë Krediti\" me shumën blu.",
    ],
  },
  {
    version: "1.200",
    date: "2026-07-13",
    notes: [
      "Edhe Raporti i Detajuar total i agjentit (te Agjentët dhe te faqja e detajeve të agjentit) tani përdor dizajnin e ri kompakt horizontal (landscape) — një rresht për çdo rezervim me kolonat Rezervimi, PNR, Klienti, Fluturimi, Data e Nisjes, Krijuar, Statusi, Total, Paguar, Pagesa dhe Detyrim, me TOTALI në fund.",
      "Historia e Krediteve në Raportin e Detajuar u ristilizua në të njëjtin format kompakt zebra; \"Balanca Kredit\" shfaqet në shiritin përmbledhës lart (vetëm informuese).",
      "Rezervimet pa detyrim në Raportin e Detajuar e shfaqin kolonën \"Detyrim\" me ngjyrë jeshile (€0).",
    ],
  },
  {
    version: "1.199",
    date: "2026-07-13",
    notes: [
      "Raporti i Detyrimeve (te Agjentët) u ridizajnua plotësisht: format horizontal (landscape) kompakt me një rresht për çdo rezervim — Rezervimi, PNR, Klienti, Fluturimi, Data e Nisjes, Krijuar, Statusi, Total, Paguar, Pagesa dhe Detyrimi, me rreshtin TOTALI në fund.",
      "Kolonë e re \"Pagesa\" në Raportin e Detyrimeve (PDF dhe Excel): tregon mënyrën dhe datën e çdo pagese të marrë (p.sh. \"Bankë 12/07 + Cash 13/07\").",
      "Të dhënat e agjencisë (emri, kompania, email, telefoni) shfaqen vetëm një herë në krye të raportit, jo të përsëritura për çdo rezervim.",
    ],
  },
  {
    version: "1.198",
    date: "2026-07-13",
    notes: [
      "Raporti i Detyrimeve (te Agjentët) tani shfaq edhe kreditin e portofolit të agjentit si \"Kredit Gjendje\" — vetëm informues, NUK zbritet nga detyrimi. Në PDF si kuti përmbledhëse, në Excel si rresht i veçantë pas TOTALI-t.",
    ],
  },
  {
    version: "1.197",
    date: "2026-07-13",
    notes: [
      "Raporti i Detyrimeve u zhvendos te faqja e Agjentëve: te butoni \"Gjenero Raport\" i çdo agjenti tani ka edhe opsionin \"Raport Detyrimet\" — PDF i detajuar VETËM me rezervimet me pagesë të mangët (Printo / Shkarko PDF / Shkarko Excel).",
      "U hoq tab-i \"Detyrimet\" nga faqja Raportet (bashkë me lejen dhe endpoint-in përkatës) — ishte shtuar në vendin e gabuar.",
    ],
  },
  {
    version: "1.196",
    date: "2026-07-13",
    notes: [
      "Tab i ri \"Detyrimet\" te Raportet: lista e të gjitha rezervimeve aktive (jo të anuluara) me pagesë të mangët — me kartat përmbledhëse (totali i detyrimeve €, numri i rezervimeve, agjencitë me detyrim), grupim sipas agjencisë, filtër sipas agjencisë dhe opsional sipas datave, plus eksport CSV \"Detyrimet CSV\". Leje e re \"Shiko raportin e detyrimeve\" te Cilësimet → Lejet (aktive si parazgjedhje për menaxherët).",
    ],
  },
  {
    version: "1.195",
    date: "2026-07-13",
    notes: [
      "PNR i rezervimit tani sinkronizohet AUTOMATIKISHT nga serveri sa herë ndryshon PNR i një pasagjeri — nuk varet më nga shfletuesi, kështu nuk mund të mbetet më asnjë rezervim pa PNR (si rasti KTF5843). U plotësuan edhe 3 rezervimet ekzistuese që e kishin fushën bosh.",
    ],
  },
  {
    version: "1.194",
    date: "2026-07-13",
    notes: [
      "Lista e rezervimeve nuk shfaq më \"NOT ISSUED\" kur rezervimi ka PNR te pasagjerët (p.sh. importet automatike): tani kolona PNR merr PNR-in e rezervimit, dhe kur ai mungon, PNR-të e pasagjerëve ose të biletës së grupit (pa dublikate). E njëjta logjikë edhe te kërkimi me PNR dhe eksporti Excel/PDF — në të dyja temat (klasike + Premium), desktop dhe mobile.",
    ],
  },
  {
    version: "1.193",
    date: "2026-07-12",
    notes: [
      "Eksporti i listës së rezervimeve (Shkarko → Excel dhe PDF) tani përfshin kolonën \"Komisioni\" për çdo rezervim, plus shumën totale te rreshti TOTALI (komisionet negative zbriten). Kolona shfaqet vetëm për përdoruesit me të drejtën e komisionit në listë.",
    ],
  },
  {
    version: "1.192",
    date: "2026-07-12",
    notes: [
      "Lista e rezervimeve (tema Premium): komisioni negativ tani shfaqet te rreshtat me etiketë të kuqe (më parë fshihej kur ishte nën 0).",
      "Shiriti i totalit poshtë listës tani ka edhe fushën \"Komisioni\" — shuma e komisioneve të faqes (përfshirë humbjet negative), e dukshme sipas të drejtës së komisionit në listë.",
    ],
  },
  {
    version: "1.191",
    date: "2026-07-12",
    notes: [
      "Komisionet negative tani llogariten realisht: kur çmimi neto është më i madh se shitja (p.sh. rezervim me total €0 dhe neto €345), komisioni del negativ dhe zbritet nga komisioni total te Raportet, Dashboard-i, Ledger-i i pagesave dhe eksportet Excel/CSV. Më parë pritej në 0 dhe humbja injorohej.",
    ],
  },
  {
    version: "1.190",
    date: "2026-07-12",
    notes: [
      "Email-i i njoftimit për ndryshim orari tani dërgohet në anglisht (titulli, orari i vjetër → i riu, rezervimet, pasagjerët dhe paragrafi i ndryshimit të datës pa pagesë). Kopja përmbledhëse për sistemin mbetet në shqip.",
    ],
  },
  {
    version: "1.189",
    date: "2026-07-12",
    notes: [
      "Faqe e re \"Ndryshime Orari\": kur ndryshon orari i një fluturimi (nisja ose mbërritja) që ka rezervime aktive, fluturimi regjistrohet automatikisht në listën \"Fluturimet me Ndryshime Orari\" (menu → Ndryshime Orari, me numërues portokalli).",
      "Nga kjo faqe zgjidhni me kuti se cilëve marrës (agjenci ose klientë direkt) t'u dërgohet email-i i njoftimit. Email-i përmban orarin e vjetër → të riun dhe të gjitha rezervimet e marrësit me pasagjerët, pa PDF; një kopje shkon te email-i i sistemit.",
      "Kur nisja zhvendoset më shumë se 3 orë, email-i shton automatikisht paragrafin e të drejtës për ndryshim date pa pagesë.",
    ],
  },
  {
    version: "1.188",
    date: "2026-07-12",
    notes: [
      "Task-u automatik që krijohej kur një fluturim dilte Sold Out tani është me opsion te Cilësimet → Kontrolli i Vendeve (\"Krijo task automatik kur fluturimi del Sold Out\"). Si parazgjedhje është i çaktivizuar — nuk krijohet asnjë task, dërgohet vetëm email-i i njoftimit. Mund ta aktivizoni sërish kur të doni.",
    ],
  },
  {
    version: "1.187",
    date: "2026-07-12",
    notes: [
      "Kontroll automatik për pasagjerë të dyfishtë: kur krijohet një rezervim (ose shtohet një pasagjer) dhe i njëjti pasagjer gjendet edhe në një rezervim tjetër ekzistues për fluturim IDENTIK (datë + destinacion + numër fluturimi), krijohet automatikisht një task me prioritet të lartë që tregon kodin/kodet e rezervimeve të tjera ku është i përfshirë pasagjeri, me njoftim për admin dhe manager.",
    ],
  },
  {
    version: "1.186",
    date: "2026-07-12",
    notes: [
      "Pastrim përfundimtar i emërtimit të palejuar nga ÇDO tekst që del në sistem: mesazhet e gabimit të importit (arsyeja te \"Njoftime Importi\"), email-et e njoftimeve (subjekte + përmbajtje), etiketa e lejes \"Konfiguro integrimet\", dhe njoftimet ekzistuese në bazën e të dhënave — kudo tani lexohet \"Offline\".",
    ],
  },
  {
    version: "1.185",
    date: "2026-07-11",
    notes: [
      "Te faqja \"Njoftime Importi\", çdo njoftim rezervimi tani shfaq qartë edhe kodin CP me etiketën \"Kodi CP: <kodi>\" (kur kodi është i disponueshëm), që të identifikohet menjëherë rezervimi.",
    ],
  },
  {
    version: "1.184",
    date: "2026-07-11",
    notes: [
      "Faqja \"Njoftime Importi\" u zhvendos në fund të menusë anësore (mbi njoftimet e Kërkesave të Çmimit) dhe u hoq çdo emërtim i palejuar nga titulli/etiketat — burimi i importit tani shfaqet thjesht si \"Offline\".",
    ],
  },
  {
    version: "1.183",
    date: "2026-07-11",
    notes: [
      "SHTUAR: Njoftime brenda sistemit (vetëm për admin) kur importi i rezervimeve dështon. Deri tani për këto dështime dërgohej vetëm email; tani shfaqen edhe brenda sistemit te menuja e re \"Njoftime Importi\" (me numërues të kuq në sidebar). Mbulohen DY raste: (1) rezervime/dosje që s'importohen dot (vende të pamjaftueshme, fluturimi s'gjendet, format i keq CSV) — me kodin e referencës dhe arsyen; (2) kur dështon lidhja fare (SFTP ose Email/IMAP nuk lidhet). Çdo njoftim ka buton \"Zgjidhur\" për ta hequr, dhe mund të shihen edhe të zgjidhurat. Njoftimet nuk përsëriten pafund për të njëjtin problem të pazgjidhur.",
    ],
  },
  {
    version: "1.182",
    date: "2026-07-11",
    notes: [
      "Kur bëhet një shitje që ul numrin e vendeve (nga çdo agjent, nga faqja publike, ose nga rezervim i importuar nga Offline), lista e fluturimeve tani i dërgohet MENJËHERË Offline (brenda pak sekondash), pa pritur ciklin automatik të 30 minutave. Kjo mbyll dritaren ku Offline mund të shihte më shumë vende të lira sesa realiteti dhe të bënte mbishitje.",
    ],
  },
  {
    version: "1.181",
    date: "2026-07-11",
    notes: [
      "Kalimi automatik në \"Sold Out\" tani ndodh edhe kur vendet e lira bëhen 0 MANUALISHT — jo vetëm kur shitet vendi i fundit. Nëse admini ndryshon një fluturim (ose përdor vendosjen në grup të vendeve) dhe e sjell numrin e vendeve të lira në 0, statusi kalon menjëherë në \"Sold Out\". Vlen vetëm nga \"I Hapur\" → \"Sold Out\"; asnjë fluturim nuk rihapet automatikisht.",
    ],
  },
  {
    version: "1.180",
    date: "2026-07-11",
    notes: [
      "Kur një fluturim mbush të gjitha vendet (0 vende të lira), statusi i tij tani kalon automatikisht në \"Sold Out\". Kjo ndodh menjëherë sapo shitet vendi i fundit (krijim rezervimi, rikthim rezervimi, shtim ose rikthim pasagjeri). Foshnjat nuk zënë vend, ndaj nuk ndikojnë. Kalimi ndodh vetëm nga \"I Hapur\" → \"Sold Out\"; asnjë fluturim nuk rihapet automatikisht.",
    ],
  },
  {
    version: "1.179",
    date: "2026-07-11",
    notes: [
      "Te faqja e Fluturimeve, tab-et \"Të Afërta\" dhe \"Të Konfirmuara\" tani shfaqin vetëm fluturimet me status \"open\" (I Hapur), njësoj si tab-i \"Bookable\". Fluturimet e mbyllura ose sold-out nuk dalin më në këto dy lista. Numrat (badge) e këtyre tab-eve u përditësuan për të përputhur me listat. Tab-et \"Past\" (të gjitha) dhe \"Sold out\" (vetëm sold-out) mbeten të pandryshuara.",
    ],
  },
  {
    version: "1.178",
    date: "2026-07-11",
    notes: [
      "Te tabela Excel e detajeve të rezervimit (kolona SHENIME), kodi PNR që vendoset manualisht tani duhet të ketë saktësisht 6 karaktere — as më pak, as më shumë. Fusha nuk lejon më shumë se 6 karaktere dhe ruajtja bllokohet nëse PNR-ja ka 1–5 karaktere (fusha shfaqet me kufi të kuq). Bosh lejohet (për ta pastruar). Numri automatik i personave në biletë nuk preket.",
    ],
  },
  {
    version: "1.177",
    date: "2026-07-10",
    notes: [
      "U rregullua karta \"Borxh Total\" te Dashboard-i: tani nga borxhi i çdo agjenti zbritet krediti (wallet balance) që agjenti ka te ne, sepse ai ka paguar paraprakisht edhe pse shumat s'janë kaluar ende në bileta. Krediti zbritet i kufizuar për çdo agjent (borxhi neto s'shkon kurrë nën zero) dhe krediti i një agjenti nuk fshin borxhin e një agjenti tjetër.",
    ],
  },
  {
    version: "1.176",
    date: "2026-07-10",
    notes: [
      "U rregullua çelësi (toggle) i email-eve te profili i agjentit: më parë kur klikoje një çelës (Njofto me email ose çelësat e statusit), ai vizualisht ngecte në gjendjen e vjetër derisa të përgjigjej serveri. Tani çelësi ndryshon menjëherë (UI optimiste) dhe kthehet mbrapsht vetëm nëse ruajtja dështon.",
    ],
  },
  {
    version: "1.175",
    date: "2026-07-10",
    notes: [
      "Te të dy butonat që kopjojnë fluturimet (\"Kopjo Listën\" dhe \"Kopjo për Klient\") u hoq \"/P\" nga fundi i çmimit dhe u vendos simboli \"€\" pas çmimit — p.sh. tani shfaqet \"180€\" në vend të \"180/P\".",
    ],
  },
  {
    version: "1.174",
    date: "2026-07-10",
    notes: [
      "Te Dashboard-i u shtua një grafik i ri me shtylla që tregon numrin e pasagjerëve për çdo ditë për 30 ditët e ardhshme (sipas datës së nisjes së fluturimit), bashkë me totalin e pasagjerëve në krye. Numërohen vetëm rezervimet dhe pasagjerët jo të anuluar.",
    ],
  },
  {
    version: "1.173",
    date: "2026-07-10",
    notes: [
      "Te lista e fluturimeve u shtua butoni i ri \"Kopjo për Klient\" (pranë \"Kopjo Listën\"). Ai kopjon të njëjtën listë, por rrugën e shfaq me EMRAT e qyteteve në vend të kodeve — p.sh. \"DORTMUND-TIRANE\" në vend të \"DTM-TIA\" — gati për ta dërguar te klienti në WhatsApp.",
    ],
  },
  {
    version: "1.172",
    date: "2026-07-09",
    notes: [
      "Kërkim i ri pasagjerësh te Dashboard-i (VETËM për administratorin): zgjidh Nisjen, Mbërritjen dhe Datën dhe shiko sa pasagjerë ka në atë datë — të grupuar sipas fluturimit, me komisionin për secilin fluturim dhe totalet. Buton \"Shkarko PDF\" që gjeneron të njëjtin raport PDF si ai i email-it të mëngjesit, por për kriteret e kërkuara.",
    ],
  },
  {
    version: "1.171",
    date: "2026-07-09",
    notes: [
      "PDF-ja e raportit \"Pasagjerët e Ditës\" tani tregon komisionin e fituar për SECILIN fluturim (djathtas te titulli i fluturimit, me ngjyrë jeshile) dhe komisionin total në krye të dokumentit, pranë numrit të pasagjerëve.",
    ],
  },
  {
    version: "1.170",
    date: "2026-07-09",
    notes: [
      "Raporti ditor i shitjeve u bë PREMIUM: çdo natë në 23:55 vjen email me dizajn modern (karta statistikash, tabela e shitjeve të ditës) + PDF elegant në format horizontal me listën e plotë të shitjeve — ora, referenca, klienti, fluturimi, agjencia, pasagjerët, shuma dhe komisioni për çdo rezervim, plus totalet. Zëvendëson raportin e vjetër bazik të mbrëmjes.",
    ],
  },
  {
    version: "1.169",
    date: "2026-07-09",
    notes: [
      "Raport i ri ditor me email \"Pasagjerët e Sotëm\": çdo mëngjes në orën 06:00 vjen automatikisht një email me numrin e pasagjerëve që fluturojnë atë ditë, komisionin e fituar nga këto rezervime dhe listën e plotë të pasagjerëve në PDF (të grupuar sipas fluturimit, me PNR, rezervim dhe agjenci).",
    ],
  },
  {
    version: "1.168",
    date: "2026-07-09",
    notes: [
      "Dashboard: karta \"Pasagjerë Sot\" tani ka filtër me datë fillimi – datë mbarimi për të parë pasagjerët e fluturimeve të ardhshme në çdo interval datash (default: sot), me buton \"Sot\" për t'u kthyer shpejt.",
    ],
  },
  {
    version: "1.167",
    date: "2026-07-09",
    notes: [
      "Dashboard: kartë e re e vogël \"Pasagjerë Sot\" në fillim të faqes — tregon numrin e pasagjerëve (jo të anuluar) që kanë biletë për fluturim me nisje sot.",
    ],
  },
  {
    version: "1.166",
    date: "2026-07-09",
    notes: [
      "Kreditim automatik në kuletën e agjentit edhe kur çmimi ndryshohet te pasagjeri: nëse pas rillogaritjes së totalit (ndryshim çmimi bilete, ekstra, anulim pasagjeri) rezulton tepricë ndaj shumës së paguar, diferenca regjistrohet automatikisht si rimbursim + kredi në kuletë (njësoj si ndryshimi i Shumës së Shitjes).",
    ],
  },
  {
    version: "1.165",
    date: "2026-07-09",
    notes: [
      "Faqja e Rezervimeve (pamja premium): vizat ndarëse mes rreshtave të tabelës u bënë më të theksuara që të dallohen qartë.",
    ],
  },
  {
    version: "1.164",
    date: "2026-07-09",
    notes: [
      "Tema \"Gri Klasik\": kolona anësore majtas tani është gri e zbehtë (stil premium, e çelët) në vend të grisë së errët.",
      "\"Gri Klasik\" është tani tema default e sistemit (për përdoruesit që s'kanë zgjedhur temë më parë).",
    ],
  },
  {
    version: "1.163",
    date: "2026-07-08",
    notes: [
      "Tema \"Gri Klasik\" tani është kopje identike e temës Premium: faqet Rezervimet, Krijimi i Rezervimit dhe Detajet e Rezervimit shfaqen me të njëjtin layout premium — vetëm ngjyrat janë gri.",
    ],
  },
  {
    version: "1.162",
    date: "2026-07-08",
    notes: [
      "Logoja e Albania Sky tani shfaqet edhe te faqja e menaxhimit — lart në tab-in e browserit (favicon), njësoj si te faqja e jashtme.",
    ],
  },
  {
    version: "1.161",
    date: "2026-07-08",
    notes: [
      "Temë e re \"Gri Klasik\" te Cilësimet → Tema e Ndërfaqes: ngjyrë gri e qetë për sistemin, me viza dhe ndarje fushash më të dukshme (bordurat më të errëta në tabela, forma dhe kuti).",
    ],
  },
  {
    version: "1.160",
    date: "2026-07-08",
    notes: [
      "Regjistri i Pagesave: badge-t 👤 KLIENT dhe 📄 FATURË tani janë të klikueshëm — me 1 klik dhe 1 konfirmim ndryshohet lloji i pagesës (Klient ↔ Faturë).",
    ],
  },
  {
    version: "1.159",
    date: "2026-07-08",
    notes: [
      "Mbrojtje e re financiare: nuk lejohet ndryshimi i agjencisë së një rezervimi kur ai ka pagesa të kryera. Sistemi e bllokon ndryshimin me njoftim (edhe në ekran, edhe në server) dhe tregon shumën e paguar. Pasi pagesat të fshihen ose të rimbursohen, rezervimi mund të kalojë te agjencia tjetër normalisht.",
    ],
  },
  {
    version: "1.158",
    date: "2026-07-08",
    notes: [
      "Te detajet e agjentit, badge 'Aktiv' / 'Joaktiv' (lart djathtas) tani është buton: adminët mund të klikojnë mbi të për ta çaktivizuar ose riaktivizuar agjentin. Për userat jo-admin mbetet vetëm shfaqje.",
    ],
  },
  {
    version: "1.157",
    date: "2026-07-07",
    notes: [
      "Te 'Rezervim i Ri' (zgjedhja e fluturimit), data në mes të rreshtit (mbi 'Direkt') u bë më e dallueshme: më e madhe, me shkronja të trasha dhe ngjyrë më të errët. Vetëm stil — asnjë funksion nuk ndryshoi.",
    ],
  },
  {
    version: "1.156",
    date: "2026-07-03",
    notes: [
      "Te eksporti 'Kopjo për Excel' / 'Kopjo për WhatsApp' (te detajet e rezervimit), kolona e ekstrave tani tregon edhe PRIORITETIN: nëse pasagjeri ka prioritet shfaqet 'PRIOR'; nëse ka prioritet + bagazh shfaqet 'PRIOR+20 KG' (ose 'PRIOR+BAG' kur kg-të s'janë të vendosura); vetëm bagazh mbetet si më parë ('20 KG'/'BAG'); infant mbetet 'INF'.",
    ],
  },
  {
    version: "1.155",
    date: "2026-07-03",
    notes: [
      "U shtua një filtër i ri te menuja 'Seats & Bookings' në listën e fluturimeve: 'Fluturime me vende' — tregon vetëm fluturimet që kanë ende vende bosh (vende të lira > 0), e kundërta e 'Fluturime pa vende'.",
    ],
  },
  {
    version: "1.154",
    date: "2026-07-02",
    notes: [
      "Butoni 'Kopjo Listën' (te lista e fluturimeve, për ta bërë paste në WhatsApp) tani përdor ÇMIMIN E FLUTURIMIT (kolona 'One Way'), jo çmimin e Google. Kështu lista e kopjuar tregon të njëjtin çmim që shfaqet te fluturimi.",
    ],
  },
  {
    version: "1.153",
    date: "2026-07-02",
    notes: [
      "Emrat e pasagjerëve dhe emri i klientit tani pranojnë VETËM SHKRONJA (pa numra). Kontrolli u shtua në të gjitha faqet ku shkruhet/ndryshohet një emër: krijimi i rezervimit (versioni klasik dhe premium), shtimi dhe ndryshimi i pasagjerëve te detajet e rezervimit, redaktimi i emrit të klientit, si dhe forma publike e rezervimit online (booking-engine). Lejohen hapësira, viza (-), apostrofa (') dhe pika për emra të përbërë; nëse shkruhet një numër, shfaqet mesazhi 'Emri duhet të përmbajë vetëm shkronja (pa numra)' dhe ruajtja bllokohet.",
    ],
  },
  {
    version: "1.152",
    date: "2026-07-01",
    notes: [
      "Importi i rezervimeve nga Offline (SFTP + email) tani kontrollohet çdo 1 MINUTË (më parë çdo 2 minuta) — rezervimet e reja futen në sistem më shpejt. U shtua edhe mbrojtje anti-mbivendosje: nëse një kontroll zgjat më shumë se intervali, kontrolli i radhës pret dhe nuk nisen dy importe njëkohësisht.",
    ],
  },
  {
    version: "1.151",
    date: "2026-07-01",
    notes: [
      "Cilësimet → Kontrolli i Vendeve: fusha 'Çdo sa kohë' u shndërrua në fushë ku shkruan vetë ÇDO SA MINUTA të kryhet kontrolli (më parë ishte listë me orë të gatshme). Tani mund të vendosësh çdo vlerë minutash (minimumi 1 minutë), p.sh. 10, 20 ose 45 minuta. Kontrolli tani ekzekutohet saktësisht sipas minutave të vendosura.",
    ],
  },
  {
    version: "1.150",
    date: "2026-07-01",
    notes: [
      "Cilësimet: rifreskimi i çmimeve për fluturimet e afërta u bashkua brenda kartës ekzistuese 'Kontrolli i Vendeve'. Tani ka një çelës të ri 'Përfshi edhe rifreskimin e çmimeve në Google' — kur është aktiv, i njëjti kontroll (me të njëjtat ditë dhe interval) rikontrollon edhe çmimet në Google për fluturimet brenda periudhës dhe përditëson çmimin e shitjes sipas rregullave. Karta e veçantë 'Rifreskimi i Çmimeve — Fluturimet e Aferta' u hoq (nuk nevojitet më interval i dytë). Është e fikur si default (opt-in).",
    ],
  },
  {
    version: "1.148",
    date: "2026-07-01",
    notes: [
      "Te lista e fluturimeve, badge-i i fluturimit të konfirmuar tani shfaq vetëm shenjën e yllit (⭐), pa tekstin 'Konfirmuar' — për një pamje më të pastër. Funksioni mbetet i njëjtë.",
    ],
  },
  {
    version: "1.147",
    date: "2026-07-01",
    notes: [
      "Te Flight Inventory: zgjedh disa fluturime (ose të gjitha) dhe te shiriti i veprimeve del butoni 'Kopjo Listën'. E kopjon listën në një format të gatshëm për WhatsApp — një rresht për fluturim: 'NISJA-MBERRITJA DITË MUAJ ORA  ÇMIM/P' (p.sh. 'PSA-TIA 2 JUL 08:00  180/P'). Çmimi është çmimi i Google; nëse një fluturim s'ka çmim Google në cache, përdoret çmimi i shitjes që rreshti të mos mbetet bosh. Pastaj thjesht bëje paste në WhatsApp.",
    ],
  },
  {
    version: "1.146",
    date: "2026-06-30",
    notes: [
      "Te skeda 'Njoftime' (Flight Inventory) tani mund të zgjedhësh disa fluturime (ose të gjitha me kutizën në krye) dhe shfaqet butoni i gjelbër 'Konfirmo Njoftimet' te shiriti i veprimeve — konfirmon njoftimet e të gjitha fluturimeve të zgjedhura njëherësh (njësoj si butoni 'Confirm' për rresht, vetëm në grup). Statusi i fluturimeve NUK ndryshon; njoftimet thjesht largohen nga lista.",
    ],
  },
  {
    version: "1.145",
    date: "2026-06-30",
    notes: [
      "Kutia 'Përjashto nga rregulli i çmimit të Google' te një fluturim tani e përjashton atë fluturim EDHE nga kontrolli automatik i numrit të vendeve në Google (ai që bëhet për fluturimet e afërta dhe që mund t'i nxjerrë vetvetiu 'Sold Out'). Pra një fluturim me këtë kuti të aktivizuar bëhet plotësisht manual: nuk i ndryshohet çmimi automatikisht NGA Google dhe nuk i kontrollohen vendet/nuk del automatikisht Sold Out. (Vetëm logjikë e brendshme — API-ja e partnerëve nuk preket.)",
    ],
  },
  {
    version: "1.144",
    date: "2026-06-30",
    notes: [
      "Cilësimet → Rregullat e Çmimeve sipas Google: forma e rregullit tani hapet si FAQE MË VETE brenda seksionit, jo më e zgjeruar brenda listës. Kur klikon një rregull (ose 'Rregull i Ri'), lista zhduket dhe shfaqet vetëm forma me një buton 'Kthehu te lista' lart. Kështu faqja nuk kërcen më dhe ke gjithë hapësirën për të punuar; pas ruajtjes kthehesh automatikisht te lista te rregulli që ndryshove.",
    ],
  },
  {
    version: "1.143",
    date: "2026-06-29",
    notes: [
      "Cilësimet → Rregullat e Çmimeve sipas Google: tani kur ruan një rregull, faqja NUK kërcen më — sistemi të kthen automatikisht te i njëjti rregull (rreshti i tij vihet në qendër të ekranit), kështu nuk e humb më vendin ku ishe.",
      "Forma e rregullit u bë më kompakte/praktike: 'Çmimi minimal i shitjes' dhe 'Çmimi maksimal i shitjes' për çdo nivel tani shfaqen në të njëjtin rresht horizontal (më parë ishin njëri poshtë tjetrit), që do të thotë më pak rrëshqitje vertikale.",
    ],
  },
  {
    version: "1.142",
    date: "2026-06-29",
    notes: [
      "Rregullim i rëndësishëm: filtri 'Dif. min – Dif. max' (dhe filtri 'Google min – max') te skeda 'Çmim i Ri' tani kërkon në TË GJITHA fluturimet, jo vetëm te faqja aktuale. Më parë filtri vepronte vetëm mbi 50 rreshtat e faqes që shihje, kështu që dukej sikur 'nuk funksiononte' kur kishe mijëra fluturime. Tani, sapo aktivizon një nga këta filtra, sistemi ngarkon të gjithë listën që përputhet, e filtron sipas diferencës/çmimit Google, dhe e ndan në faqe vetë (faqja tregon vetëm rezultatet e filtruara). 'Zgjidh të gjitha' zgjedh të gjitha rezultatet e filtruara. (Vetëm pamje/filtër — çmimet, 'Updato Çmimet' dhe API-ja e partnerëve nuk preken.)",
    ],
  },
  {
    version: "1.141",
    date: "2026-06-29",
    notes: [
      "Rregullim: renditja sipas kolonave 'Çmim i Ri' dhe 'Diferenca' (që ekzistojnë vetëm te skeda 'Çmim i Ri') tani pastrohet automatikisht kur largohesh nga ajo skedë. Më parë, nëse rendisje sipas njërës prej tyre dhe kaloje te një skedë tjetër, lista tjetër mbetej e renditur sipas një kolone të padukshme pa asnjë tregues — tani kthehet te renditja standarde sipas datës. (Vetëm pamje — çmimet, përzgjedhja dhe 'Updato Çmimet' nuk preken.)",
    ],
  },
  {
    version: "1.140",
    date: "2026-06-29",
    notes: [
      "Te skeda 'Çmim i Ri' u shtua një filtër i ri për kolonën 'Diferenca': dy kuti 'Dif. min' – 'Dif. max' në shiritin e filtrave (shfaqen vetëm te kjo skedë). Shkruan vlerat (mund të jenë negative, p.sh. -80 deri -40) dhe tabela shfaq vetëm fluturimet ku diferenca bie brenda intervalit. Diferenca llogaritet njësoj si te kolona (Çmim i Ri − Google i Ruajtur), kështu që filtri përputhet gjithmonë me atë që shihet. (Vetëm pamje/filtër — çmimet, përzgjedhja dhe 'Updato Çmimet' nuk preken.)",
    ],
  },
  {
    version: "1.139",
    date: "2026-06-29",
    notes: [
      "Te skeda 'Çmim i Ri' tani çdo kolonë e tabelës mund të renditet me klik mbi titullin e saj: Route, Flight Number, Date, Çmimi Ynë, Google i Ruajtur, Çmim i Ri dhe Diferenca. Klik i parë rendit nga më i vogli te më i madhi, klik i dytë anasjelltas; një shigjetë tregon kolonën dhe drejtimin aktiv. Fluturimet pa vlerë në kolonën e renditur shkojnë në fund. (Vetëm pamje — çmimet, përzgjedhja dhe 'Updato Çmimet' nuk preken.)",
    ],
  },
  {
    version: "1.138",
    date: "2026-06-29",
    notes: [
      "Rregullim i rëndësishëm: rifreskimi automatik i çmimeve (ora 02:00) dhe kontrolli i fluturimeve 'Pa Çmim' kishin ndaluar së punuari në heshtje. Shkaku ishte një kërkesë drejt Google që mbetej e varur pa afat kohor, e cila bllokonte përgjithmonë mekanizmin e rifreskimit derisa serveri të rindizej. Tani çdo kërkesë drejt Google ka një afat skadimi (25 sekonda) dhe u shtua një mbrojtje ('watchdog') që e liron vetë bllokimin nëse mbetet i ngecur — kështu rifreskimi automatik nuk mund të ngrijë më. Çmimet rifreskohen sërish normalisht.",
    ],
  },
  {
    version: "1.137",
    date: "2026-06-28",
    notes: [
      "Rregullim te skeda 'Çmim i Ri': pas klikimit të 'Updato Çmimet', kolona 'Google i Ruajtur' tani freskohet menjëherë dhe tregon çmimin e ri të aplikuar (më parë mbante çmimin e vjetër në ekran edhe pse në server ishte përditësuar, kështu që dukej sikur s'ndryshonte asgjë). Gjithashtu mesazhi i konfirmimit u bë i qartë: tregon sa çmime Google u përditësuan realisht me çmimet e reja, në vend të numrit të çmimeve të shitjes (që ishte 0 kur nuk ka rregull aktiv Google dhe ngatërronte).",
    ],
  },
  {
    version: "1.136",
    date: "2026-06-28",
    notes: [
      "Te skeda 'Çmim i Ri': butoni 'Updato Çmimet' tani përditëson VETËM fluturimet që kanë një 'Çmim i Ri' (kandidat nga Google). Fluturimet që shfaqin 'S'ka' nuk preken kurrë. Nuk është më e nevojshme t'i zgjedhësh një nga një: nëse nuk ke zgjedhur asnjë rresht, butoni i përditëson të gjitha fluturimet e dukshme që kanë çmim të ri (përdor faqësimin 'Të gjitha' për t'i kapur të gjitha njëherësh); nëse ke zgjedhur disa rreshta, përditësohen vetëm ata që kanë çmim të ri. Numri te butoni tregon sa fluturime do të preken.",
    ],
  },
  {
    version: "1.135",
    date: "2026-06-28",
    notes: [
      "Te skeda 'Çmim i Ri' u kthyen DY kolonat e çmimit të Google: 'Google i Ruajtur' (çmimi i vjetër/i ruajtur që përdoret aktualisht) dhe 'Çmim i Ri' (çmimi më i fundit që ka gjetur Google). Kolona 'Diferenca' tregon ndryshimin mes çmimit të ri dhe atij të ruajtur. Te v1.133/1.134 këto ishin bashkuar në një kolonë të vetme; tani secila duket veçmas, ashtu siç ishte kërkuar. Butoni 'Updato Çmimet' aplikon çmimin e ri (kolona 'Çmim i Ri'). Shënim: është normale që 'Çmim i Ri' të jetë i ndryshëm nga 'Google i Ruajtur' — ky është qëllimi i faqes: të krahasoni çmimin që keni me çmimin e ri që sjell Google.",
    ],
  },
  {
    version: "1.134",
    date: "2026-06-28",
    notes: [
      "Përmirësim i brendshëm te skeda 'Çmim i Ri': butoni 'Updato Çmimet' tani aplikon GJITHMONË saktësisht çmimin e Google që shfaqet te rreshti (i njëjti burim si kolona 'Çmimi Google' dhe dritarja e fluturimit). U hoq një rast i veçantë i rrallë ku mund të aplikohej një çmim i ndryshëm nga ai i shfaqur. Pa ndryshim të dukshëm në përdorim — vetëm garanci që 'aplikohet ajo që shihet'.",
    ],
  },
  {
    version: "1.133",
    date: "2026-06-28",
    notes: [
      "Rregullim i rëndësishëm te skeda 'Çmim i Ri': çmimi i Google në listë tani përputhet GJITHMONË me çmimin që del kur hap fluturimin. Më parë lista kishte një kolonë të veçantë 'Çmim i Ri' që e merrte vlerën nga një kontroll i ndarë e më i ngadaltë, prandaj mund të shfaqte një çmim tjetër (p.sh. 150) nga ai i dritares së fluturimit (p.sh. 180), ose 'S'ka çmim' edhe pasi e përditësoje çmimin nga dritarja. Tani lista ka një kolonë të vetme 'Çmimi Google' (çmimi i ruajtur i Google, i njëjti që shihet te dritarja e fluturimit dhe te lista klasike), dhe kolona 'Diferenca' llogaritet midis çmimit të Google dhe çmimit tonë. Kështu, kur e përditëson çmimin nga dritarja e fluturimit, ndryshimi duket menjëherë edhe te lista, dhe butoni 'Updato Çmimet' aplikon saktësisht çmimin që shfaqet në rresht.",
    ],
  },
  {
    version: "1.132",
    date: "2026-06-28",
    notes: [
      "Rregullim: butoni 'Rifresko' te skeda 'Çmim i Ri' nuk bllokohet më nga kontrolli automatik. Më parë, kur kontrolli automatik (që punon vazhdimisht në sfond) ishte aktiv, klikimi te 'Rifresko' (qoftë 'Të gjitha' ose 'Të zgjedhurat') jepte mesazhin 'Një kontroll është duke u kryer'. Tani rifreskimi manual ka radhën e vet të pavarur dhe nis menjëherë; mesazhi 'duke u kryer' shfaqet vetëm nëse ke nisur tashmë një rifreskim manual tjetër.",
    ],
  },
  {
    version: "1.131",
    date: "2026-06-28",
    notes: [
      "Te skeda 'Çmim i Ri', butoni 'Rifresko' tani ka dy mënyra: 'Të gjitha' (rifreskon çmimet e reja për të gjitha fluturimet, si më parë) dhe 'Të zgjedhurat' (rifreskon çmimet e reja vetëm për fluturimet që ke zgjedhur me kutizat). Kjo e dyta aktivizohet vetëm kur ke zgjedhur të paktën një fluturim dhe është shumë më e shpejtë kur do të kontrollosh disa fluturime të caktuara.",
    ],
  },
  {
    version: "1.130",
    date: "2026-06-28",
    notes: [
      "Te skeda 'Çmim i Ri' tani shfaqen VETËM fluturimet aktive — pra fluturime me shitje të hapur që ende nuk kanë nisur. Përjashtohen fluturimet 'Plotë' (sold out), ato me shitje të mbyllura (pending) dhe ato të kaluara. Numri te etiketa e skedës u përshtat që të tregojë vetëm fluturimet aktive.",
    ],
  },
  {
    version: "1.129",
    date: "2026-06-28",
    notes: [
      "Rregullim: te skeda 'Çmim i Ri', kolona 'Google i Ruajtur' shfaqte 'S'ka' për shumicën e fluturimeve. Tani kjo kolonë e merr çmimin e Google njësoj si lista klasike (cache i përbashkët), kështu që shfaq të njëjtin çmim Google që shihet edhe te lista kryesore. Kolona 'Diferenca' tani llogaritet kundrejt po atij çmimi që shfaqet te 'Google i Ruajtur' (jo kundrejt një vlere të vjetër në bazën e të dhënave), që shfaqja dhe diferenca të mos kundërshtojnë njëra-tjetrën. Shënim: nëse për një fluturim nuk ka fare çmim Google të ruajtur (p.sh. fluturime të së njëjtës ditë që Google nuk i çmon), kolona shfaq me të drejtë 'S'ka'.",
    ],
  },
  {
    version: "1.128",
    date: "2026-06-28",
    notes: [
      "Shtohet skeda e re 'Çmim i Ri' te lista e fluturimeve (pranë 'Çmim i Vjetër'). Aty shfaqen TË GJITHA fluturimet e ardhshme me çmimin më të fundit LIVE nga Google, i marrë automatikisht në një interval të konfigurueshëm — VETËM për shikim, nuk aplikohet vetë. Tabela tregon: çmimin tonë, çmimin e Google të ruajtur, çmimin e ri të Google dhe diferencën. Admini zgjedh fluturimet dhe shtyp 'Updato Çmimet' që e bën çmimin e ri të Google çmimin e ruajtur DHE rillogarit çmimin tonë sipas rregullave ekzistuese. Te Cilësimet shtohet kartela 'Çmimi i Ri — Kërkim Automatik' (interval + ON/OFF + Rifresko Tani).",
    ],
  },
  {
    version: "1.127",
    date: "2026-06-28",
    notes: [
      "Te detajet e një fluturimi dhe te një rezervimi, admini tani sheh TRE çmime: çmimin tonë, çmimin e Google të ruajtur (cache), dhe çmimin e ri të Google — i marrë drejtpërdrejt nga Google në çastin që hapet fluturimi/rezervimi (vetëm për atë fluturim). Shtohet butoni 'Përditëso çmimin nga Google' (vetëm admini) që e ruan çmimin e ri të Google dhe rillogarit automatikisht çmimin tonë sipas rregullit (−%/fiks) për atë fluturim.",
    ],
  },
  {
    version: "1.126",
    date: "2026-06-28",
    notes: [
      "Çmimi i një fluturimi binte te minimumi (p.sh. €150) sa herë Google e humbiste PËRKOHËSISHT çmimin, dhe ngjitej sërish kur Google e kthente — duke krijuar luhatje gjatë ditës. Tani, kur Google nuk ka çmim përkohësisht, sistemi E RUAN çmimin e fundit të mirë (nuk e ul më te minimumi). Vlen për çmimin e brendshëm dhe atë offline. Çmimi rivlerësohet vetëm në orën 02:00 ose me butonin 'Rifresko Tani'.",
    ],
  },
  {
    version: "1.125",
    date: "2026-06-27",
    notes: [
      "Çmimet po ndryshonin ende disa herë në ditë edhe pas çaktivizimit të rifreskimit 30-minutësh. Shkaku: kontrolli automatik 'Pa Çmim' (çdo X minuta) rikontrollonte edhe fluturimet me 'Çmim i Vjetër' (stale), duke i rishkruar çmimet gjatë ditës. Tani ky kontroll prek VETËM fluturimet që s'kanë fare çmim. Fluturimet me 'Çmim i Vjetër' e ruajnë çmimin e mëparshëm (shfaqen te lista e veçantë 'Çmim i Vjetër') dhe rifreskohen vetëm në orën 02:00 ose me butonin 'Rifresko Tani'.",
    ],
  },
  {
    version: "1.124",
    date: "2026-06-27",
    notes: [
      "Në celular, kur hapej një rezervim (tema Premium), butoni 'X' për mbylljen rrinte lart djathtas dhe mbulohej nga shiriti i adresës së shfletuesit — nuk dukej. Tani u shtua një buton 'X' i dukshëm brenda shiritit të sipërm të rezervimit (pranë statusit), që mbetet gjithmonë i arritshëm; shiriti i sipërm tani qëndron 'sticky' edhe kur hapet si dritare.",
    ],
  },
  {
    version: "1.123",
    date: "2026-06-26",
    notes: [
      "Te subjekti i email-it të statusit u hoq etiketa 'CP ' para kodit të referencës Offline: tani shfaqet vetëm '[<kodi>]' (p.sh. '[CPE9RW2R]') në vend të '[CP <kodi>]'. Vlen vetëm për rezervimet CP.",
    ],
  },
  {
    version: "1.122",
    date: "2026-06-26",
    notes: [
      "U çaktivizua rifreskimi automatik i çmimeve nga Google çdo 30 minuta (dhe ai pas ristartimit), sepse çmimet po ndryshonin shumë shpesh gjatë ditës. Tani çmimet nga Google rifreskohen vetëm: (1) një herë në natë në orën 02:00, (2) kur shtypet butoni 'Rifresko Tani', dhe (3) kur ndryshohet vetë rregulli i çmimeve. Kontrolli i fluturimeve 'Pa Çmim' (çdo X minuta) mbetet i ndryshueshëm nga Cilësimet.",
    ],
  },
  {
    version: "1.121",
    date: "2026-06-26",
    notes: [
      "Te e-Ticket-i (email) u zvogëluan shkronjat e referencave (Booking Reference, CP Reference, Airline PNR) dhe u ngushtuan hapësirat, që kolona 'Airline PNR' të mos dilte jashtë pamjes — tani duket e plotë. PNR-ja për çdo pasagjer u bë më e errët/e dukshme.",
    ],
  },
  {
    version: "1.120",
    date: "2026-06-26",
    notes: [
      "Te subjekti i email-eve për rezervimet ONLINE TRAVEL, u hoq fjala 'CP' që shtohej para referencës, sepse vetë kodi i Offline-it tashmë fillon me 'CP' (p.sh. 'CPZP55WZ') — dilte i dyfishuar. Tani subjekti tregon vetëm referencën brenda kllapave me hapësira: p.sh. 'Confirmed: KTF1707 [ CPZP55WZ ]'.",
    ],
  },
  {
    version: "1.119",
    date: "2026-06-26",
    notes: [
      "Te subjekti i email-eve për rezervimet ONLINE TRAVEL, referenca CP filloi të shkruhej me hapësirë brenda kllapave, sipas kërkesës së partnerit.",
    ],
  },
  {
    version: "1.118",
    date: "2026-06-26",
    notes: [
      "Rregullim te skeda 'Pa Çmim': pas 'Fshi cache', fluturimet pa çmim nuk dilnin më në asnjë listë (numri ishte 0), edhe pse te kolona Google shfaqnin 'S'ka'. Tani 'Pa Çmim' përfshin edhe fluturimet që s'kanë fare rresht në cache (jo vetëm ato me çmim NULL), kështu pas fshirjes së cache-it ato shfaqen menjëherë te skeda dhe rikontrollohen nga sistemi.",
    ],
  },
  {
    version: "1.117",
    date: "2026-06-25",
    notes: [
      "Përmbledhje Ditore automatike: çdo natë në orën 00:01 (fund i ditës) dërgohet një email me të gjitha veprimet e ditës që sapo mbaroi — rezervimet e reja, pagesat, rimbursimet, anulimet, fluturimet e reja, dhe i gjithë regjistri i veprimeve të agjentëve (login, kërkime, krijim rezervimi, pagesa, etj.).",
      "Backup-i në Excel (Google Sheets) freskohet automatikisht në 00:01 para se të nisë email-i, dhe linku i tij përfshihet brenda email-it të përmbledhjes ditore.",
    ],
  },
  {
    version: "1.116",
    date: "2026-06-25",
    notes: [
      "Fluturimet Offline: u shtua butoni i ri me shumicë 'Kthe në Auto'. Kur selekton fluturime, mund t'i kthesh të gjitha menjëherë te Çmimi Offline Auto (hiqet çmimi manual, llogaritet vetë nga çmimi bazë + markup). Vlen vetëm për fluturimet e zgjedhura dhe kërkon konfirmim.",
    ],
  },
  {
    version: "1.115",
    date: "2026-06-25",
    notes: [
      "Rezervimet CP (agjencia ONLINE TRAVEL): referenca CP (Offline) tani përfshihet kudo te email-i — te trupi (body) i email-it, te subjekti i email-it, dhe vazhdon të shfaqet te PDF-ja e konfirmimit. Më parë dilte vetëm te PDF-ja/voucher-i.",
      "Te e-bileta që i shkon klientit shfaqet një kolonë e re 'CP Reference' krahas 'Booking Reference'; te email-i i brendshëm (admin) shtohet rreshti 'CP Reference'; dhe te subjekti shtohet '[CP <kodi>]'. Vlen vetëm për rezervimet CP — rezervimet e tjera nuk preken.",
    ],
  },
  {
    version: "1.114",
    date: "2026-06-25",
    notes: [
      "U mbyll një boshllëk: fluturimet që kishin çmim por NUK kishin asnjë rresht çmimi Google të ruajtur (kurrë të marrë ose i fshirë) nuk rikontrollohej kurrë dhe çmimi i tyre ngecte. Tani rikontrolli automatik i përfshin edhe këto, që çdo fluturim i menaxhuar nga rregulli të reflektojë gjithmonë çmimin aktual të Google.",
      "Tani çmimi i një fluturimi të menaxhuar reflekton gjithmonë gjendjen aktuale: çmimi LIVE nëse ka, ndryshe çmimi I VJETËR (i fundit i njohur), dhe nëse nuk ka FARE çmim Google, përdoret çmimi MINIMUM i rregullit (në vend që të mbetej i ngecur te vlera e vjetër).",
    ],
  },
  {
    version: "1.113",
    date: "2026-06-24",
    notes: [
      "Rikontrolli automatik i çmimeve 'Pa Çmim' dhe 'Çmim i Vjetër' tani është default çdo 5 minuta dhe aktiv. Më parë ishte 30 minuta — kështu një çmim i vjetër rikuperohet shumë më shpejt.",
      "Te Cilësimet, karta 'Kontrolli i Çmimeve' u riemërtua dhe u sqarua që mbulon edhe fluturimet me 'Çmim i Vjetër', jo vetëm 'Pa Çmim'. Intervali konfigurohet po aty (default 5 min).",
    ],
  },
  {
    version: "1.112",
    date: "2026-06-24",
    notes: [
      "U shtua një gjendje e tretë për çmimin nga Google: 'Çmim i Vjetër'. Kur rifreskimi i natës (ose një kontroll automatik) dështon ose nuk kthen çmim, sistemi NUK e fshin më çmimin e fundit të mirë — e mban atë dhe e shënon si 'i vjetër'. Kështu fluturimet nuk kalojnë më gabimisht te 'Pa Çmim'.",
      "Te lista e fluturimeve u shtua një skedë e re 'Çmim i Vjetër' (me numërues) që tregon vetëm fluturimet me çmim të ruajtur por të vjetër. Te rreshti, çmimi i vjetër shfaqet me një etiketë portokalli 'i vjetër'.",
      "Rikuperim automatik: sapo kontrolli i radhës kthen një çmim të ri, flamuri 'i vjetër' hiqet vetvetiu dhe fluturimi rikthehet te 'Me çmim'. 'Pa Çmim' tani do të thotë vetëm fluturime që nuk kanë pasur kurrë çmim.",
    ],
  },
  {
    version: "1.111",
    date: "2026-06-24",
    notes: [
      "Eksporti te Offline tani përfshin orën e mbylljes së shitjes (end_selling_date) për ÇDO fluturim veç e veç, ashtu siç është vendosur aktualisht (sellCutoffHours i fluturimit). Më parë përdorej një vlerë e vetme globale për të gjitha fluturimet.",
      "Kur një fluturim nuk ka orë të caktuar veçanërisht, përdoret cilësimi global (sell_cutoff_hours), njësoj si te logjika e shitjes në faqen publike.",
    ],
  },
  {
    version: "1.110",
    date: "2026-06-24",
    notes: [
      "Te faqja publike e rezervimeve (Albania Sky), çmimi për vizitorë (jo të kyçur) tani rrumbullakoset në euro të plotë në vend që të dalë me decimale (p.sh. €149.4 → €149, €132.8 → €133). Shkaku ishte markup-i i faqes në përqindje që prodhonte decimale.",
      "Çmimet e agjentëve dhe ato të kyçur nuk ndryshojnë (kishin tashmë rrumbullakimin e tyre).",
      "API-ja e partnerëve nuk u prek (çmimet e /v1/* mbeten të pandryshuara).",
    ],
  },
  {
    version: "1.109",
    date: "2026-06-24",
    notes: [
      "Te faqja 'Fluturimet', filtri 'Seats & Bookings' u kthye në një menu me tre opsione: 'Fluturime me rezervim', 'Fluturime pa rezervim' dhe 'Fluturime pa vende' (pa vende të lira). Mund të zgjedhësh një opsion ose ta heqësh filtrin.",
      "Filtri zbatohet edhe te 'Zgjidh të gjitha' (select-all) që veprimet në masë të prekin vetëm fluturimet e shfaqura.",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.108",
    date: "2026-06-23",
    notes: [
      "Roli 'Menaxher' nuk ka më leje për të shkarkuar Excel ose PDF te lista e Rezervimeve. Butoni 'Shkarko' fshihet kur leja është e fikur.",
      "Shtua leja e re e kontrollueshme 'Eksporto rezervimet (Excel/PDF)' (can_export_bookings) te Cilësimet → Lejet; default-i për Menaxherin është tani OFF (mund të ndizet manualisht nga admini për çdo përdorues).",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.107",
    date: "2026-06-23",
    notes: [
      "Te 'Raport Ndryshimi Çmimesh' (email + Excel + PDF) tani shfaqen KATËR kolona çmimi në vend të tri: 'Google Vjetër' + 'Google i Ri' (çmimi i vjetër dhe i ri nga Google) si dhe 'Çmimi Ynë Vjetër' + 'Çmimi Ynë i Ri'. Kështu shihet qartë sa ndryshoi çmimi i Google-it që shkaktoi ndryshimin e çmimit tonë.",
      "Çmimi i vjetër i Google-it ruhet automatikisht në çdo rifreskim (kolona e re 'prev_price' te cache-i i çmimeve të Google-it).",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.106",
    date: "2026-06-23",
    notes: [
      "Te 'Cilësimet' u shtua një kartë e re 'Email \"Raport Ndryshimi Çmimesh\"' (vetëm admini) që kontrollon SE KUR dërgohet email-i i raportit kur rifreskimi i Google ndryshon çmime. Opsionet: (1) 'Në çdo ndryshim' (parazgjedhje, si më parë), (2) 'Vetëm raporti i përditshëm (02:00) + kur rifreskoj manualisht' — heq email-et nga rifreskimi automatik periodik, (3) 'Vetëm kur ndryshojnë shumë fluturime njëherësh' (cakton ti numrin minimal), (4) 'Asnjëherë (fikur)'. KUJDES: çmimet përditësohen GJITHMONË automatikisht — kjo zgjedhje prek VETËM email-in, jo ndryshimin e çmimeve.",
      "Sqarim: rifreskimi i vërtetë i çmimeve nga Google bëhet sipas intervalit te 'Rifreskimi i Çmimeve nga Google' (aktualisht ~6 orë), jo çdo 30 min. Etiketa 'çdo 30 min' në email tregonte vetëm sa shpesh KALON kontrolluesi, jo sa shpesh merren çmimet nga Google.",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.105",
    date: "2026-06-22",
    notes: [
      "Te 'Aktiviteti i agjentit', hapi i parë i kërkimit të një rruge (kur përdoruesi zgjedh nga → për te faqja kryesore, që thërret '/flight-dates') tani shfaqet si 'Kërkoi fluturime: FROM → TO' bashkë me rrugën, në vend të 'Hapi: GET /flight-dates' pa detaje. Kështu shihet qartë cilin fluturim po kërkojnë përdoruesit. Kur s'ka rrugë, shfaqet 'Shikoi datat e fluturimeve'.",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.104",
    date: "2026-06-22",
    notes: [
      "Te detajet e rezervimit, tabela e parapamjes së tekstit që kopjohet (Excel/WhatsApp) u bë më kompakte: u ulën hapësirat (padding), gjerësitë e kolonave dhe pak fonti, dhe u hoq gjerësia minimale e detyruar prej 700px. Kështu shihet më shumë tekst njëherësh dhe nevojitet më pak rrëshqitje horizontale. Vetëm dukja u ndryshua — të dhënat dhe teksti që kopjohet mbeten të njëjta.",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.103",
    date: "2026-06-22",
    notes: [
      "Adresa (URL) e faqes 'Offline Flights' u ndryshua në '/offline-flights', që te shiriti i adresës të shfaqet vetëm emërtimi Offline. Etiketa e menysë mbetet 'Offline Flights'. Vetëm rruga e dukshme u ndryshua — asnjë funksion (çmimet Offline, importi/eksporti, të dhënat) nuk u prek.",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.102",
    date: "2026-06-22",
    notes: [
      "Rregullim: flamuri 'Nuk ka vende' (low_seats) shfaqej edhe te fluturimet e largëta kur bëhej kontrolli manual 'Kontrollo Çmime + Orare' (p.sh. me 'zgjidh të gjitha'). Tani flamuri i vendeve vendoset VETËM për fluturimet brenda dritares së kontrollit të vendeve (Cilësimet → ditët e kontrollit të vendeve, aktualisht 3 ditë), njësoj si kontrolli automatik. Fluturimet më të largëta nuk shënohen më për vende.",
      "U pastruan gjithashtu flamujt e vjetër 'Nuk ka vende' te të gjitha fluturimet jashtë kësaj dritareje. Kontrolli i çmimeve dhe orareve mbetet i pandryshuar.",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.101",
    date: "2026-06-22",
    notes: [
      "Te 'Rregullat e Çmimeve sipas Google' (Cilësimet) u pastrua etiketa e vjetër nga blloku Offline — tani lexohet thjesht 'Apliko te çmimi Offline'. Vetëm tekst i ndërfaqes; sjellja mbetet e njëjtë.",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.100",
    date: "2026-06-22",
    notes: [
      "Rregullim: kur shtohej një pasagjer i ri te një rezervim ekzistues, numri i vendeve të shitura dhe vendet e lira NUK përditësohej. Tani shtimi i një pasagjeri (që zë vend — i rritur/fëmijë) e rrit automatikisht numrin e vendeve të shitura te fluturimi dhe rillogarit totalin e rezervimit.",
      "Foshnjat (që nuk zënë vend) nuk e ndryshojnë numrin e vendeve, si më parë.",
      "Nëse fluturimi është plot, shtimi i një pasagjeri që zë vend bllokohet me njoftim ('Fluturimi është plot').",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.99",
    date: "2026-06-22",
    notes: [
      "Te 'Rregullat e Çmimeve sipas Google' (Cilësimet) zbritja Offline tani është KREJT E PAVARUR nga zbritja e fluturimeve. Çdo rregull ka dy blloqe të veçanta: 'Apliko te çmimi i fluturimeve (i rritur/fëmijë)' dhe 'Apliko te çmimi Offline'.",
      "Kur aktivizon 'Apliko te çmimi Offline', hapen FUSHA TË VETA për Offline-in: lloji i zbritjes, nivelet (Min–Max €, vlera, çmimi minimal/maksimal i shitjes) dhe opsioni 'çmim fiks' — të ndara plotësisht nga nivelet e fluturimeve.",
      "Një rregull i vetëm mund të drejtojë njëkohësisht çmimin e fluturimeve DHE çmimin Offline, secilin me zbritjen e vet. Mund të zgjedhësh edhe vetëm njërin.",
      "U hoq butoni i vjetër 'Kopjo për Offline' (nuk nevojitet më). Rregullat ekzistuese Offline ruajnë sjelljen e tyre — nivelet e tyre kalojnë automatikisht te blloku i ri Offline.",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.98",
    date: "2026-06-22",
    notes: [
      "Te faqja 'Rezervimet' u shtua butoni 'Shkarko' (te shiriti i filtrave) që eksporton listën AKTUALE të filtruar në Excel ose PDF — me të njëjtat kolona si tabela (Data, REF, PNR, Klienti, Agjencia, Fluturimi, PAX, Total/Paguar/Mbetet, Statusi) dhe një rresht TOTALI në fund.",
      "Eksporti respekton filtrat e zgjedhur (kërkim, status, agjenci, periudhë date) dhe përfshin TË GJITHA rezervimet e filtruara, jo vetëm faqen aktuale.",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.97",
    date: "2026-06-21",
    notes: [
      "Pastruam tekstin e opsionit Offline te 'Rregullat e Çmimeve sipas Google' — tani shfaqet vetëm 'Apliko te çmimi Offline' pa fjalë shtesë në kllapa.",
    ],
  },
  {
    version: "1.96",
    date: "2026-06-21",
    notes: [
      "Te forma e 'Rregullave të Çmimeve sipas Google': kur ndizet opsioni 'Apliko te çmimi Offline', nivelet/uljet shfaqen me ngjyrë më të errët (amber) që të dallohet qartë se rregulli është në modalitetin Offline. Vlerat ruhen ashtu siç janë dhe mbeten të editueshme.",
    ],
  },
  {
    version: "1.95",
    date: "2026-06-21",
    notes: [
      "Te 'Rregullat e Çmimeve sipas Google' (Cilësimet) u shtua opsioni 'Apliko te çmimi Offline'. Kur është aktiv, rregulli vendos çmimin e fluturimeve Offline (faqja Offline Flights) duke përdorur të njëjtën zbritje/nivele, i llogaritur nga çmimi i Google.",
      "U shtua butoni 'Kopjo për Offline' te çdo rregull: krijon një kopje të njëjtë të rregullit, të parambushur dhe TË EDITUESHME, me opsionin offline të ndezur — pa e prekur rregullin origjinal.",
      "Rregullat 'internal' (çmimi i shitjes) dhe ato 'offline' tani punojnë në mënyrë të pavarur: një fluturim mund të preket nga njëri rregull dhe/ose tjetri. Fluturimet e vendosura te 'Përjashto nga Google' nuk preken nga asnjëri (kështu ndryshimi manual i çmimit offline 'ngec').",
      "API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.94",
    date: "2026-06-21",
    notes: [
      "Te 'Aktiviteti i agjentit' (lista e agjentëve) tani shfaqet edhe rruga e kërkuar për çdo kërkim fluturimi — p.sh. 'Kërkoi fluturime: TIA → FCO · 2026-07-10' — bashkë me linkun e plotë me parametrat. Më parë shihej vetëm 'Shikoi fluturimet' pa detaje. API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.93",
    date: "2026-06-20",
    notes: [
      "U hoq cilësimi 'Tregu i kërkimit në Google Flights' (i shtuar te 1.92). Kërkimi i çmimeve nga Google u kthye saktësisht siç ishte më parë. API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.92",
    date: "2026-06-20",
    notes: [
      "Te Cilësimet u shtua zgjedhja e 'Tregut të kërkimit në Google Flights' (country_code). Tani mund të zgjidhet vendi nga i cili Google 'kërkon' (parazgjedhje: Shqipëri AL), gjë që ndikon cilat agjenci/OTA dhe çmime shfaqen për çmimin-referencë (p.sh. tregu gjerman zakonisht nxjerr më shumë OTA). Zbatohet te të tri kërkimet në Google (çmim, orare, vende të lira). Ndikon vetëm te çmimi nga Google — API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.91",
    date: "2026-06-19",
    notes: [
      "Te Cilësimet u shtua një çelës i ri 'Shenjat \"Social Proof\" (Booking Engine)' që aktivizon/çaktivizon shenjat demonstrative te kartat e fluturimeve në faqen publike (p.sh. '🔥 4 persona rezervuan 44 min më parë' / '3 persona po shikojnë tani'). Kur çaktivizohet, ato fshihen plotësisht nga klientët. Si parazgjedhje mbeten aktive (sjellja e mëparshme). Vetëm shenjat dekorative — API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.90",
    date: "2026-06-19",
    notes: [
      "Te faqja e Pagesave (libri), shumat '+€…' tani shfaqen me ngjyrë të ZEZË (jo më jeshile/rozë/portokalli sipas mënyrës së pagesës), që të lexohen qartë mbi sfond të bardhë. Etiketat e mënyrës së pagesës (Kartë, MIRI CASH, RAIFFEISEN BANK, etj.) mbeten me ngjyrat e tyre dalluese; pagesat e anuluara mbeten me vijë të kuqe. Vetëm pamja ndryshoi — API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.89",
    date: "2026-06-19",
    notes: [
      "Te lista e rezervimeve (tabela), rreshtat e rezervimeve të ANULUARA tani shfaqen me vijë (strikethrough) dhe tekst të ZI — jo më të kuqe — me sfond neutral. Vetëm statusi 'Anuluar' mbetet i kuq, që të dallohet qartë. Vlen për të dyja temat (Premium dhe Klasik). Vetëm pamja ndryshoi — asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.88",
    date: "2026-06-19",
    notes: [
      "Te lista e rezervimeve, kutia e shumës së paguar (kur rezervimi është paguar plotësisht) dhe statusi 'Ticketed/Biletuar' tani mbushen me jeshilen e plotë #00b050 me tekst të bardhë, për t'u dalluar qartë. Vlen për të dyja temat (Premium dhe Klasik), si te tabela në desktop ashtu edhe te pamja mobile. Vetëm ngjyrat ndryshuan — asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.86",
    date: "2026-06-18",
    notes: [
      "Te detajet e rezervimit, numri i telefonit të klientit tani fshihet për userat JO-admin (njësoj si emaili që fshihej tashmë). Kjo vlen si te pamja standalone e rezervimit (karta 'Klienti') ashtu edhe te dialogët (Informacion Klienti). Adminët vazhdojnë t'i shohin të gjitha të dhënat. Asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.85",
    date: "2026-06-18",
    notes: [
      "Te 'Cilësimet → Rregullat e Çmimeve sipas Google', forma e rregullit u bë e përshtatshme edhe për TELEFON: në ekrane të vegjël fushat 'Emri/Lloji' dhe filtrat e datës nuk rrinë më të ngjeshura në një rresht, por rreshtohen dy ose një nga një sipas gjerësisë; rreshti i nivelit të çmimit (Min–Max → vlera) dhe çmimet minimale/maksimale të shitjes mbështillen (wrap) automatikisht kur s'ka vend, pa dalë jashtë ekranit. Në ekrane të mëdha pamja mbetet e njëjtë (dy kolona). Vetëm paraqitja (layout) ndryshoi — asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.84",
    date: "2026-06-18",
    notes: [
      "Te 'Cilësimet → Rregullat e Çmimeve sipas Google', faqja shfrytëzon tani hapësirën bosh majtas/djathtas: në ekrane të mëdha kontejneri i cilësimeve zgjerohet dhe forma e rregullit hapet INLINE në DY kolona (të dhënat bazë + nivelet e çmimit majtas; fluturimet + filtrat e datës + 'Rregull aktiv' djathtas). Kështu forma hapet menjëherë poshtë rregullit pa e shtyrë faqen poshtë sa më parë, dhe lista shfaq emra më të gjatë pa i prerë. Vetëm paraqitja (layout) ndryshoi — asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.83",
    date: "2026-06-18",
    notes: [
      "Te 'Cilësimet → Rregullat e Çmimeve sipas Google', lista e rregullave u bë shumë më kompakte: çdo rregull tani shfaqet në një rresht të vetëm horizontal (emri, statusi, nivelet e çmimit, fluturimet) pa zënë shumë hapësirë. Kur klikon mbi një rregull, ai HAPET menjëherë poshtë tij (inline) për ndryshim — nuk të çon më në fund të listës. Klik përsëri për ta mbyllur. Pamja u përshtat me temën Premium (ngjyra e theksit). Asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.82",
    date: "2026-06-18",
    notes: [
      "Te 'Cilësimet → Rregullat e Çmimeve sipas Google', çdo nivel çmimi tani ka edhe një 'Çmim maksimal i shitjes' (krahas 'Çmimit minimal' ekzistues). Nëse e plotëson, çmimi i llogaritur për atë nivel nuk e kalon kurrë këtë vlerë; nëse e lë bosh, nuk ka kufi sipër (si më parë). Kur çmimi minimal dhe maksimal bien në kundërshtim, minimumi ka përparësi (nuk shitet kurrë nën minimumin). Kufiri maksimal respektohet edhe pas rrumbullakimit te 5-a. Asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.81",
    date: "2026-06-17",
    notes: [
      "Te lista e 'Fluturimet' u shtua një tab i ri 'Përjashtuar Online' (me ikonën 🚫, ngjyrë portokalli) menjëherë pas tabit 'Njoftime'. Ky tab shfaq VETËM fluturimet që janë përjashtuar nga ndryshimi automatik i çmimit të Google — domethënë ato që kanë shenjën e kuqe (X) te kolona e çmimit të Google ('Çaktivizuar nga lista e çmimeve të Google — çmimi nuk ndryshohet automatikisht'). Numëruesi te tabi tregon sa fluturime të tilla ka (vetëm ato që nuk kanë nisur ende). Filtri dhe numërimi bëhen në server; 'Zgjidh të gjitha' nëpër faqe funksionon edhe për këtë tab. Asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.80",
    date: "2026-06-17",
    notes: [
      "Butonat e Google — 'Sinkronizo Çmimet' dhe 'Kontrollo Çmime + Orare' te listat e Fluturimeve dhe 'Offline Flights', si dhe te 'Cilësimet' karta 'Rifreskimi i Çmimeve nga Google' (intervali + 'Rifresko Tani') dhe karta 'Kontrolli i Çmimeve për Fluturimet Pa Çmim' (intervali + 'Kontrollo Tani') — tani kontrollohen nga një leje e re te 'Cilësimet → Lejet': 'Përdor butonat e Google (Sinkronizo Çmimet / Kontrollo Çmime + Orare)'. Si parazgjedhje këto shfaqen VETËM për adminin; manager-i dhe stafi i agjencisë nuk i shohin dhe nuk mund t'i përdorin, përveçse kur admini ua jep shprehimisht lejen te lista e lejeve. Kontrolli zbatohet edhe te ndërfaqja edhe te serveri. Shfaqja e çmimit të Google te kolona e fluturimeve mbetet e dukshme për të gjithë (vetëm-lexim). Asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.79",
    date: "2026-06-17",
    notes: [
      "Te faqja 'Detyrat' u shtua mundësia për të ndryshuar statusin e shumë detyrave njëherësh. Kliko butonin e ri 'Zgjidh' lart djathtas: shfaqen kutiza zgjedhjeje te çdo detyrë dhe një shirit veprimi me 'Zgjidh të gjitha', numëruesin e të zgjedhurave, një menu për të zgjedhur statusin (Backlog / Për të bërë / Në punë / Në rishikim / Përfunduar / Anuluar) dhe butonin 'Apliko'. Ky opsion është i disponueshëm për të gjithë përdoruesit (admin, manager, staf agjencie); secili përdorues mund të ndryshojë vetëm detyrat që sheh/ka qasje. Asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.78",
    date: "2026-06-17",
    notes: [
      "Çmimet e Google nuk ndryshojnë më kur një përdorues thjesht HAP ose SHIKON një fluturim. Më parë, hapja e listës ose e një fluturimi mund të nxiste një kërkim të ri te Google dhe të rifreskonte çmimin e ruajtur — kjo bënte që çmimet të luhateshin papritur. Tani shfaqja e çmimit është vetëm-lexim: të gjithë përdoruesit shohin të njëjtin çmim të ruajtur (cache). Rifreskimi i vërtetë nga Google bëhet VETËM nga rrugët e adminit/sistemit: rifreskimi periodik sipas intervalit të vendosur (TTL, aktualisht 24 orë), rifreskimi automatik i përditshëm (02:00) dhe butoni manual 'Rifresko Tani'. Kështu, çmimi që vendos admini me rifreskim shfaqet njësoj për të gjithë. Asnjë funksion tjetër dhe API-ja e partnerëve nuk u prek.",
    ],
  },
  {
    version: "1.77",
    date: "2026-06-17",
    notes: [
      "Faqja e jashtme e rezervimit (booking-engine): kur pasagjeri është 'I Rritur', fusha e Datëlindjes nuk shfaqet më. Për fëmijët dhe foshnjat fusha mbetet e detyrueshme si më parë. Asnjë funksion tjetër nuk u prek.",
    ],
  },
  {
    version: "1.76",
    date: "2026-06-17",
    notes: [
      "Sa herë që bëhet rifreskim çmimesh nga Google dhe ndryshohet çmimi i të paktën një fluturimi, dërgohet automatikisht një email raport te adresa e njoftimeve, me një PDF dhe një Excel bashkëngjitur. Raporti tregon për çdo fluturim: rrugën, numrin e fluturimit, datën, çmimin e Google, çmimin e vjetër, çmimin e ri dhe ndryshimin (rënie me ngjyrë jeshile, rritje me të kuqe). Raporti dërgohet në të tre rastet e rifreskimit: rifreskimi manual 'Rifresko Tani', rifreskimi i përditshëm automatik (02:00) dhe rifreskimi periodik çdo 30 minuta. Nëse asnjë çmim nuk ndryshon, nuk dërgohet email.",
    ],
  },
  {
    version: "1.75",
    date: "2026-06-17",
    notes: [
      "Email-i përmbledhës i rezervimit: te tabela PASAGJERET, kolona 'Çmimi' tani shfaq çmimin për person edhe kur rezervimi është draft (pa çmim të ngrirë akoma) — më parë dilte '—'. Çmimi merret nga bileta e ngrirë e pasagjerit, ose nga çmimi bazë i fluturimit sipas tipit (i rritur / fëmijë / foshnjë). Bagazhi dhe prioriteti vazhdojnë të shfaqen të ndara për person te kolona 'Shtesa'.",
    ],
  },
  {
    version: "1.74",
    date: "2026-06-17",
    notes: [
      "Bagazhi i regjistruar tani shfaqet me kilogramët REALË të fluturimit (p.sh. '60 KG') në vend të vlerës fikse '20 KG'. U korrigjua te detajet e rezervimit (shiriti i pasagjerit, lista e ekstrave dhe eksporti) dhe te faqja e fluturimit. Çmimi mbetet i pandryshuar.",
    ],
  },
  {
    version: "1.73",
    date: "2026-06-16",
    notes: [
      "Kur ndryshohet çmimi i një fluturimi dhe klikohet 'Ruaj Ndryshimet', historiku i çmimeve NUK hapet më automatikisht. Historiku hapet vetëm kur klikohet butoni 'Historiku'.",
    ],
  },
  {
    version: "1.72",
    date: "2026-06-16",
    notes: [
      "Bileta elektronike (PDF + email): dimensioni i çantës së kabinës u korrigjua në '40x30x20 cm' (më parë '40x30x30 cm').",
      "Përmbledhja e çmimeve nuk i bashkon më ekstrat në një rresht të vetëm 'Seat & baggage extras': tani ato shfaqen të ndara sipas kategorisë (Seats, Baggage, Priority, Insurance), secila me çmimin e vet në krah — duke shfaqur edhe 0 kur ekstra është pa pagesë.",
    ],
  },
  {
    version: "1.71",
    date: "2026-06-16",
    notes: [
      "Numërimi mbrapsht për afatin 5-orësh tani shfaqet edhe te rezervimet në status 'Konfirmuar': fillon kur krijohet rezervimi (Draft/Pritje/Konfirmuar) dhe mbaron vetëm kur bëhet 'Biletuar' (ticketed). Te të anuluarat nuk shfaqet.",
    ],
  },
  {
    version: "1.70",
    date: "2026-06-16",
    notes: [
      "Shtuar badge me numërim mbrapsht (countdown) te lista e rezervimeve: për rezervimet në status 'Draft' ose 'Pritje' tregon sa kohë mbetet nga limiti 5-orësh për lëshimin e biletës (nga momenti i krijimit).",
      "Badge-i bëhet portokalli kur mbeten <1 orë, i kuq (me pulsim) kur mbeten <30 min, dhe shfaq 'SKADUAR' kur kalon afati. Hover-i tregon orën e saktë të afatit.",
    ],
  },
  {
    version: "1.69",
    date: "2026-06-16",
    notes: [
      "Kur krijohet një rezervim i ri (status draft): badge-i te dokumenti PDF dhe te trupi i emailit tani shfaq \"HOLD\" në vend të \"DRAFT\".",
      "Subjekti i emailit për rezervim të ri tani është \"NEW BOOKING\" (më parë \"Created: <REF>\" te emaili me PDF dhe \"Rezervim i Ri ...\" te emaili qendror i adminit).",
    ],
  },
  {
    version: "1.68",
    date: "2026-06-16",
    notes: [
      "Vetëm për agjensinë ONLINE TRAVEL, emri i agjensisë nuk shfaqet më FARE — as te e-bileta (PDF), as te trupi i emailit (rreshti \"Agjencia\"), as te subjekti i kopjes sonë të brendshme (admin). Kanal white-label. Agjensitë e tjera mbeten të pandryshuara.",
    ],
  },
  {
    version: "1.67",
    date: "2026-06-16",
    notes: [
      "Të gjitha dokumentet PDF janë tani plotësisht në anglisht për të gjitha agjensitë (më parë vetëm e-bileta ishte anglisht). U përkthyen: fatura e pagesës (INVOICE / CREDIT NOTE), fatura e kredisë në wallet (CREDIT INVOICE) dhe fatura masive (BATCH INVOICE), përfshirë etiketat e metodave të pagesës dhe formatin e datës.",
    ],
  },
  {
    version: "1.66",
    date: "2026-06-16",
    notes: [
      "Rregullim te dokumenti PDF i rezervimit: emrat e gjatë të qyteteve te seksioni FLIGHT (p.sh. Dortmund → Tirana) nuk mbishkruhen më mbi datën — teksti përshtatet automatikisht brenda kolonës.",
      "Vetëm për agjensinë ONLINE TRAVEL, banneri lart te dokumenti (TICKET ISSUED / PENDING / CANCELLED) tani te \"Reference:\" shfaq referencën e Offline (CP) në vend të referencës sonë. Agjensitë e tjera mbeten të pandryshuara.",
    ],
  },
  {
    version: "1.65",
    date: "2026-06-16",
    notes: [
      "Vetëm për agjensinë ONLINE TRAVEL, dokumenti PDF i rezervimit tani shfaq të dyja kodet e rezervimit: referencën tonë (BOOKING REFERENCE) dhe referencën e Offline (CP REFERENCE), krahas PNR-së së linjës ajrore.",
      "Te subjekti i email-it qendror të statusit u shtua data e fluturimit (p.sh. \"Ticketed: KTF3075 — ONLINE TRAVEL — DTM→TIA — 17.07.2026 — 1 PAX\").",
    ],
  },
  {
    version: "1.64",
    date: "2026-06-16",
    notes: [
      "Te profili i çdo agjenti u shtua një listë me 5 kuti zgjedhjeje për të vendosur cilat email-e statusi (me PDF) t'i dërgohen atij agjenti: Created (Krijuar), Booking is Processing (Në pritje), Confirmed (Konfirmuar), Ticketed (Biletë), Canceled (Anuluar). Funksionon vetëm kur çelësi kryesor \"Njofto me email\" është aktiv.",
      "Subjektet e email-eve të statusit u rinovuan në anglisht: Created, Booking is Processing, Confirmed, Ticketed, Canceled.",
      "Tani agjenti merr email \"Created\" edhe në momentin që krijohet rezervimi (draft) — si nga paneli i brendshëm ashtu edhe nga Booking Engine — i kushtëzuar nga kutia përkatëse e zgjedhjes te profili i tij.",
    ],
  },
  {
    version: "1.63",
    date: "2026-06-16",
    notes: [
      "Te faqja e jashtme (Booking Engine), gjinia (M/F) tani është e detyrueshme për të gjithë pasagjerët kur kryhet një rezervim. Nuk lejohet të dorëzohet rezervimi pa zgjedhur Mashkull ose Femër për secilin pasagjer (validim si te ndërfaqja ashtu edhe te serveri).",
    ],
  },
  {
    version: "1.62",
    date: "2026-06-16",
    notes: [
      "Te subjekti i email-eve të rezervimit tani përfshihet edhe totali i shumës së rezervimit, p.sh. \"New Booking CP 1 PAX HAM TIA 17 July €204 [KTF4735]\". Kjo ndihmon për ta parë vlerën e rezervimit direkt nga lista e email-eve.",
    ],
  },
  {
    version: "1.61",
    date: "2026-06-16",
    notes: [
      "Te faqja e jashtme (Booking Engine), fluturimet që nuk kanë mjaftueshëm vende të lira për numrin e pasagjerëve të kërkuar tani shfaqen si \"E Shitur\" (pa butonin Rezervo). P.sh. nëse kërkohet për 10 udhëtarë por fluturimi ka vetëm 3 vende, fluturimi del i shitur. Foshnjat NUK zënë vend, prandaj numërohen vetëm të rriturit + fëmijët. U rregullua gjithashtu numërimi i vendeve te krijimi i rezervimit nga Booking Engine që foshnjat të mos zënë vend (njësoj si pjesa tjetër e sistemit).",
    ],
  },
  {
    version: "1.60",
    date: "2026-06-16",
    notes: [
      "Te subjekti i email-eve që dërgon sistemi (rezervim i ri, ndryshim statusi, etj.) tani përfshihet edhe kodi i referencës së rezervimit, p.sh. \"New Booking 1 PAX TIA BLQ 24 August [KTFXXXX]\". Kjo e bën më të lehtë identifikimin e rezervimit direkt nga lista e email-eve pa hapur përmbajtjen.",
    ],
  },
  {
    version: "1.59",
    date: "2026-06-15",
    notes: [
      "Te tab-i \"Të Aferta\" (Fluturime të Aferta) nuk shfaqen më fluturimet e shitura plotësisht (Sold Out). Meqë këto fluturime nuk mund të shiten më, lista (dhe numri te etiketa e tab-it) tani përjashton automatikisht fluturimet Sold Out, që lista të mbetet e pastër me vetëm fluturimet që ende mund të shiten.",
    ],
  },
  {
    version: "1.58",
    date: "2026-06-15",
    notes: [
      "Shtua mundësia për të fshehur fluturimet e Booking Engine vetëm për disa agjentë. Tek faqja e agjentit (vetëm admin) është shtuar opsioni \"Lejo këtë agjent të shohë fluturimet e fshehura?\". Parazgjedhja është i çaktivizuar — pra nëse një fluturim caktohet \"Fshehur\" te lista \"Fluturimet në Booking Engine\", agjenti NUK e sheh (njësoj si publiku). Kur opsioni aktivizohet për një agjent të caktuar, ai agjent i sheh në Booking Engine edhe fluturimet e fshehura.",
    ],
  },
  {
    version: "1.57",
    date: "2026-06-15",
    notes: [
      "Shtua rifreskim automatik i çmimeve çdo natë në orën 02:00. Çdo natë sistemi pastron plotësisht cache-in, merr çmimet e fundit nga Google për të gjitha fluturimet dhe rillogarit çmimet e shitjes për fluturimet që kanë rregull — edhe nëse çmimet janë rifreskuar manualisht më herët gjatë ditës. Kjo garanton që çdo mëngjes të fillohet me çmimet më të fundit.",
    ],
  },
  {
    version: "1.56",
    date: "2026-06-15",
    notes: [
      "Çmimet e shitjes me rregull tani përditësohen MENJËHERË kur ndryshojnë çmimet e Google. Më parë, kur klikohej \"Rifresko Tani\" ose kur ndryshohej intervali i rifreskimit, përditësohej vetëm çmimi i shfaqur i Google, ndërsa çmimi real i shitjes (me rregull −% / fiks) priste deri në ciklin tjetër automatik (çdo 30 min). Tani, sapo rifreskohen çmimet e Google manualisht ose ndryshohet intervali, sistemi i rillogarit dhe i rishkruan automatikisht çmimet e shitjes për të gjitha fluturimet që kanë rregull.",
    ],
  },
  {
    version: "1.55",
    date: "2026-06-15",
    notes: [
      "Rregullim: agjencitë në faqen publike të rezervimeve (booking-engine) nuk mbeteshin më të bllokuara me gabimin e kuq \"Authentication required\" mbi butonin \"Konfirmo Rezervimin\". Shkaku: kur faqja rrinte e hapur gjatë dhe sesioni skadonte, sistemi vazhdonte ta mbante përdoruesin sikur ishte i kyçur dhe kërkesa e rezervimit kthente 401 pa rrugëdalje. Tani, nëse sesioni ka skaduar gjatë plotësimit, sistemi e ruan automatikisht draftin e rezervimit dhe e dërgon te faqja e hyrjes; pas rikyçjes, të dhënat rikthehen vetë dhe rezervimi vazhdon pa u rishkruar.",
      "Kohëzgjatja e sesionit në faqen publike u rrit nga 4 orë në 12 orë (sa te sistemi i brendshëm), që agjencitë të mos ç'kyçen gjatë ditës së punës.",
    ],
  },
  {
    version: "1.54",
    date: "2026-06-15",
    notes: [
      "Fluturimet që kalojnë SOLD OUT nuk përfshihen më në asnjë kërkesë çmimi te Google Flights. Më parë sistemi vazhdonte t'i kontrollonte çmimet edhe për fluturimet e shitura plotësisht (çdo 30 min nga sistemi + për çdo rresht në listë), duke harxhuar kot kuotën e Google. Tani kursehet kuota: çmimi nuk kërkohet as automatikisht as kur hap listën. (Fluturimet aktive vazhdojnë normalisht.)",
    ],
  },
  {
    version: "1.53",
    date: "2026-06-15",
    notes: [
      "Te raporti i detajuar që shkarkohet (përfshirë raportin e agjentit), te koka e çdo rezervimi tani shfaqet edhe DATA kur është krijuar rezervimi (\"Krijuar: dd/MM/yyyy HH:mm\"), pranë statusit. Prek vetëm pamjen e raportit; asnjë llogaritje nuk ndryshon.",
    ],
  },
  {
    version: "1.52",
    date: "2026-06-15",
    notes: [
      "Te faqja \"Rezervimet\", kërkimi (kutia kryesore, PNR dhe fluturimi) tani është GLOBAL: kërkon në TË GJITHA rezervimet e ruajtura në sistem, pa u kufizuar nga filtri i datës (p.sh. \"Sot\"), agjenti apo statusi. Më parë, nëse data ishte \"Sot\", një rezervim i ditëve të kaluara nuk dilte edhe pse e kërkoje me referencë. Kur kërkon, shfaqet shënimi \"Kërkim në gjithë sistemin\". Kur nuk kërkon, filtrat e datës/agjentit/statusit punojnë si më parë.",
    ],
  },
  {
    version: "1.51",
    date: "2026-06-15",
    notes: [
      "Te faqja \"Rezervim i Ri\", çmimet e fluturimeve tani shfaqen të rrumbullakosura në euro të plotë (p.sh. €157.5 → €158), njësoj si te lista e fluturimeve — pa numra me presje/decimale. Prek vetëm pamjen; llogaritja e totalit mbetet e pandryshuar.",
    ],
  },
  {
    version: "1.50",
    date: "2026-06-15",
    notes: [
      "U shtua te Cilësimet një opsion i ri \"Markup për Vizitorët e Paregjistruar\": admini mund të vendosë një shtesë (përqindje ose shumë fikse në €) që i shtohet çmimit bazë VETËM për vizitorët e faqes së jashtme që nuk janë të loguar (jo të regjistruar). Agjentët e loguar dhe klientët e regjistruar nuk preken — çmimet, zbritjet dhe rregullat e tyre mbeten plotësisht siç ishin. Vlera 0 = pa ndryshim.",
    ],
  },
  {
    version: "1.49",
    date: "2026-06-15",
    notes: [
      "Te teksti i kopjimit (Kopjo për Excel / WhatsApp), agjencia \"TRAVEL AGENCY 771\" tani shfaqet si \"AGENCY 771\" në kolonën OPERATORI. Ky ndryshim prek vetëm tekstin që kopjohet — fusha \"Agjencia\" te informacioni i klientit mbetet e pandryshuar.",
    ],
  },
  {
    version: "1.48",
    date: "2026-06-15",
    notes: [
      "U rregullua \"Kopjo për Excel\" te detajet e rezervimit: kur emri i një pasagjeri ose emri i agjencisë përmbante një rresht të ri ose hapësira të padukshme (tab), rreshti thyhej kur ngjitej në Excel dhe kolonat zhvendoseshin (data dilte gabim, p.sh. 02.01.00 ose ######). Tani çdo qelizë pastrohet automatikisht para kopjimit, kështu që të gjitha kolonat dalin saktë në Excel.",
    ],
  },
  {
    version: "1.47",
    date: "2026-06-15",
    notes: [
      "Email-i i statusit të rezervimit (Konfirmim / E-Ticket / Anulim) që i dërgohet klientit/agjentit tani shfaq PNR-në njësoj si bileta elektronike: etiketa \"Airline PNR\", shënimi \"Online check-in is open 24 hours before the flight\", PNR-të e veçanta të pasagjerëve të bashkuara lart (p.sh. PNR1 / PNR2), dhe PNR-ja pranë emrit të çdo pasagjeri.",
    ],
  },
  {
    version: "1.46",
    date: "2026-06-14",
    notes: [
      "Bileta elektronike (e-Ticket) e klientit u përmirësua: PNR-ja tani shfaqet me etiketën \"Airline PNR\", u shtua shënimi \"Online check-in is open 24 hours before the flight\", dhe kur pasagjerët kanë PNR të veçantë, lart shfaqen të gjitha PNR-të të bashkuara (p.sh. PNR1 / PNR2).",
      "PNR-ja shfaqet tani edhe pranë emrit të çdo pasagjeri, si te PDF-ja e biletës ashtu edhe te bileta në faqe (albaniasky.com).",
    ],
  },
  {
    version: "1.45",
    date: "2026-06-14",
    notes: [
      "Email-i i njoftimit \"Rezervim i Ri\" (që vjen sa herë krijohet një rezervim) tani është më i detajuar: te tabela e pasagjerëve shtohet kolona \"Çmimi\" me çmimin e biletës për çdo pasagjer, dhe shtesat (Bagazh, Ulëse, Prioritet, Sigurim) shfaqen secila me çmimin përkatës pranë pasagjerit. Të gjitha çmimet në këtë email (Cmimi i Shitjes, Neto, Komisioni, Totali/Paguar/Mbetet, çmimet e pasagjerëve dhe shtojcat) tregohen tani si numra të plotë, pa presje.",
    ],
  },
  {
    version: "1.44",
    date: "2026-06-14",
    notes: [
      "Çmimet e fluturimeve tani nuk mund të kenë presje as kur i shkruan/redakton. Të gjitha fushat e çmimit (Adult, Fëmijë, Infant, Taksa, Bagazh, Priority) te redaktimi i fluturimit (paneli anësor + faqja e detajeve), krijimi i fluturimit, ndryshimi në masë (bulk) dhe çmimi Offline rrumbullakosen automatikisht në numër të plotë sa herë ngarkohen dhe ruhen. Vlerat me presje (p.sh. 200,21) shfaqen dhe ruhen si 200. Nuk preken API, booking-engine, çmimet e agjentëve apo automatizimi i Google.",
    ],
  },
  {
    version: "1.43",
    date: "2026-06-14",
    notes: [
      "Çmimet në të gjithë sistemin e brendshëm tani shfaqen vetëm si numra të plotë (pa shifra pas presjes) — p.sh. 150 në vend të 150.00, dhe 236 në vend të 236.25. Ndryshimi është vetëm pamor (si shfaqet çmimi); çmimet e ruajtura, llogaritjet, API-ja dhe lidhjet e tjera (booking-engine / API e partnerit / çmimet e agjentëve) nuk preken aspak.",
    ],
  },
  {
    version: "1.42",
    date: "2026-06-14",
    notes: [
      "Te lista e fluturimeve (Flight Inventory), para çmimit te kolona \"Google\", shfaqet tani një shenjë e vogël X e kuqe vetëm për fluturimet që janë çaktivizuar nga lista e çmimeve të Google (kutia \"Përjashto nga rregulli i çmimit të Google\" e aktivizuar). Kjo i dallon shpejt fluturimet të cilave çmimi nuk u ndryshohet automatikisht.",
    ],
  },
  {
    version: "1.41",
    date: "2026-06-14",
    notes: [
      "Te fluturimi (si te forma e Krijimit ashtu edhe te dritarja e Editimit) u shtua kutia \"Përjashto nga rregulli i çmimit të Google\". Kur aktivizohet për një fluturim, automatizimi i çmimit nga Google e kapërcen atë fluturim — çmimi adult/fëmijë nuk ndryshohet automatikisht dhe çmimi i vendosur me dorë mbetet i pandryshuar. Parazgjedhje: çaktivizuar (sjellja normale).",
    ],
  },
  {
    version: "1.40",
    date: "2026-06-14",
    notes: [
      "Te Cilësimet u shtua çelësi \"Rrumbullakosja e Çmimit të Agjentit\" (vetëm admin). Kur është aktiv, çmimi per-person që sheh agjenti rrumbullakoset në euro të plotë (p.sh. 132.01 € → 132 €, pa shifrat e cent pas euros); kur çaktivizohet, ruhet çmimi i saktë me 2 decimale. Prek vetëm çmimet e agjentëve (faqja e jashtme dhe API e partnerit); çmimet e brendshme/admin nuk ndryshojnë. Parazgjedhje: aktiv (sjellja e mëparshme).",
    ],
  },
  {
    version: "1.39",
    date: "2026-06-14",
    notes: [
      "Te detajet e rezervimit, butoni që fshin (anulon) një pasagjer tani kërkon konfirmim — shfaqet një dritare \"Konfirmo Fshirjen e Pasagjerit\" me butonat \"Anulo\" dhe \"Po, Fshij\", që të mos fshihet aksidentalisht me një klik.",
    ],
  },
  {
    version: "1.38",
    date: "2026-06-14",
    notes: [
      "Skeda \"Pa Çmim\" tani ka një kontroll çmimi të vetin, të veçantë nga rifreskimi i përgjithshëm. Fluturimet pa çmim rikontrollohen më shpesh (parazgjedhje çdo 30 minuta) që, sapo të dalë një çmim nga Google, të kapet shpejt. Intervali konfigurohet te Cilësimet → \"Kontrolli i Çmimeve për Fluturimet Pa Çmim\" (me buton \"Kontrollo Tani\").",
      "Fluturimet Sold Out nuk shfaqen më te skeda \"Pa Çmim\" — përjashtohen plotësisht nga lista dhe numri i saj.",
    ],
  },
  {
    version: "1.37",
    date: "2026-06-14",
    notes: [
      "Emrat e pasagjerëve tani ruhen me një format të njësuar të shkronjave kapitale: Emri me shkronjën e parë të madhe (p.sh. \"Emer\") dhe Mbiemri me të gjitha shkronjat e mëdha (p.sh. \"MBIEMER\"). Vlen për pasagjerët e krijuar brenda sistemit dhe për rezervimet që vijnë nga faqja e jashtme. Shembull: \"Emer MBIEMER\", \"Emer Emer MBIEMER\" (2 emra), \"Emer MBIEMER MBIEMER\" (2 mbiemra). Ndryshohen vetëm shkronjat kapitale, asgjë tjetër.",
    ],
  },
  {
    version: "1.36",
    date: "2026-06-14",
    notes: [
      "Rregullim: ruajtja e një fluturimi me 0 vende (p.sh. Sold Out) nuk bënte asgjë — butoni \"Ruaj Ndryshimet\" nuk kryente asnjë veprim. Tani fluturimet me 0 vende ruhen normalisht, dhe nëse ndonjë fushë nuk është e vlefshme shfaqet një njoftim në vend që të mbetet pa veprim në heshtje.",
    ],
  },
  {
    version: "1.35",
    date: "2026-06-14",
    notes: [
      "Tab i ri \"Pa Çmim\" te Flight Inventory — shfaq të gjitha fluturimet që NUK kanë çmim në Google (rreshtat me \"S'ka\" te kolona Google). Filtri punon në server me numërues, pagination dhe \"zgjidh të gjitha\".",
    ],
  },
  {
    version: "1.34",
    date: "2026-06-14",
    notes: [
      "Tab-i \"Të Konfirmuara\" te Flight Inventory tani shfaq VETËM fluturimet që kanë badge-in ⭐ \"Konfirmuar\" (fushën is_confirmed), në vend të fluturimeve me rezervime të konfirmuara. Numëruesi i tab-it dhe \"zgjidh të gjitha\" përditësohen po ashtu.",
    ],
  },
  {
    version: "1.33",
    date: "2026-06-14",
    notes: [
      "Te faqja e jashtme e agjentit, çmimi per-person i biletës tani rrumbullakoset në euro të plotë (më i afërt) — çmimi që shfaqet, ai te përmbledhja dhe shuma që paguhet janë identikë (pa decimale). Prek vetëm çmimet e agjentëve; çmimet e brendshme/admin nuk ndryshojnë.",
    ],
  },
  {
    version: "1.32",
    date: "2026-06-14",
    notes: [
      "Shtuar fusha \"Gjinia\" (Mashkull/Femër — M/F) për pasagjerët. Te faqja e jashtme (booking-engine) tani mund të zgjedhësh gjininë kur shton një pasagjer. Te faqja e brendshme shtohet kolona M/F në tabelën e pasagjerëve dhe një zgjedhës Gjinia te format Shto/Ndrysho Pasagjer.",
    ],
  },
  {
    version: "1.31",
    date: "2026-06-14",
    notes: [
      "Kolona \"Vizita\" te Agjentët tani është e klikueshme (vetëm admini): hap një dritare me regjistrin e plotë të aktivitetit të agjentit — hyrjet, faqet që hap dhe veprimet që bën, secila me datë/orë, IP dhe pajisjen/shfletuesin. Mund të filtrohet (Hyrje/Faqe/Veprime) dhe të shkarkohet si raport Excel.",
      "Sistemi tani regjistron automatikisht aktivitetin e agjentëve në faqen e rezervimeve (nga ky moment e tutje).",
    ],
  },
  {
    version: "1.30",
    date: "2026-06-14",
    notes: [
      "Te lista e fluturimeve u shtua një tab i ri \"Të Konfirmuara\" (në krah të \"Njoftime\"): tregon vetëm fluturimet që kanë të paktën një rezervim me status \"E konfirmuar\". Shtohet edhe te faqja \"Fluturimet Offline\". Numri pranë tabit tregon sa fluturime të tilla ka.",
    ],
  },
  {
    version: "1.29",
    date: "2026-06-14",
    notes: [
      "Te lista e agjentëve u shtua kolona \"Vizita\" (vetëm për administratorin): tregon sa herë ka hyrë çdo agjent në faqe dhe datën e vizitës së fundit. Nuk shihet nga përdoruesit e tjerë dhe nuk shfaqet në faqet e jashtme.",
    ],
  },
  {
    version: "1.28",
    date: "2026-06-14",
    notes: [
      "Te rregullat e çmimit Google u shtua opsioni \"Bëj çmimin fiks\": kur aktivizohet, çmimi i llogaritur NUK rrumbullakoset te 5-a, por mbahet numri ekzakt (p.sh. 132€ në vend të 130€).",
    ],
  },
  {
    version: "1.27",
    date: "2026-06-14",
    notes: [
      "Rrumbullakimi i çmimit nga rregullat e Google tani bëhet te shifra 5 më e afërt (jo gjithmonë lart): p.sh. 121 → 120, 133 → 135. Çmimi nuk zbret kurrë nën çmimin minimal të shitjes.",
    ],
  },
  {
    version: "1.26",
    date: "2026-06-14",
    notes: [
      "Çmimi i fëmijës tani vendoset gjithmonë i njëjtë me çmimin e të rriturit kur sistemi e përditëson automatikisht çmimin sipas rregullit të Google (çmimi i foshnjës nuk preket).",
    ],
  },
  {
    version: "1.25",
    date: "2026-06-14",
    notes: [
      "Te Cilësimet, seksioni \"Versioni i Sistemit\" tani është kompakt: shfaqet vetëm versioni aktual me një buton \"Shiko historikun e versioneve\" që e hap/mbyll listën — nuk zë më shumë vend.",
    ],
  },
  {
    version: "1.24",
    date: "2026-06-14",
    notes: [
      "Te lista e fluturimeve për rregullin e çmimeve sipas Google, tani shfaqen vetëm LLOJET e fluturimeve (rruga + kompania + numri), pa datën — periudha e datave caktohet veçmas më poshtë. Zgjedhja e një lloji përfshin të gjitha fluturimet e atij lloji.",
    ],
  },
  {
    version: "1.23",
    date: "2026-06-14",
    notes: [
      "Te \"Rregullat e Çmimeve sipas Google\", çmimi i llogaritur i shitjes tani rrumbullakoset gjithmonë LART te shumëfishi më i afërt i 5-ës (p.sh. 134 € → 135 €, 137 € → 140 €).",
    ],
  },
  {
    version: "1.22",
    date: "2026-06-14",
    notes: [
      "Te \"Rregullat e Çmimeve sipas Google\" (Cilësimet), kur rregulli aplikohet vetëm për disa fluturime, tani zgjedh fluturimet nga një listë me kërkim (kompania, numri, rruga, data) duke shënuar kutitë — nuk shkruan më ID-të me dorë.",
      "Çmimi minimal i shitjes tani është PËR ÇDO NIVEL: çdo nivel ka çmimin e vet minimal, kështu që kur shton një nivel të ri vendos një çmim tjetër minimal për të. Çmimi i llogaritur për një nivel nuk zbret kurrë nën çmimin minimal të atij niveli.",
    ],
  },
  {
    version: "1.21",
    date: "2026-06-14",
    notes: [
      "U shtua një lloj i ri rregullash çmimi te Cilësimet (vetëm admin): \"Rregullat e Çmimeve sipas Google\". Ndryshe nga rregullat e agjentëve, këto ndryshojnë automatikisht çmimin REAL të shitjes (çmimin e të rriturit) në listën tonë të fluturimeve, duke u nisur nga çmimi i Google Flights.",
      "Rregullat punojnë me nivele (tiers) si te agjentët: çdo nivel ka interval çmimi (matur sipas çmimit të Google) dhe një zbritje në përqindje ose shumë fikse. Filtra të njëjta me rregullat e agjentëve (rruga, kompania, data, fluturime specifike).",
      "U shtua një \"Çmim minimal i shitjes\": çmimi i llogaritur nuk zbret kurrë nën këtë vlerë.",
      "Çmimet rifreskohen automatikisht pas çdo cikli të çmimeve të Google (çdo 30 min) dhe menjëherë sapo krijon/ndryshon një rregull. Çmimi i fëmijës dhe i foshnjës nuk preket.",
    ],
  },
  {
    version: "1.20",
    date: "2026-06-13",
    notes: [
      "Faqja e fluturimeve Offline u riemërtua \"Offline Flights\" dhe emërtimi i vjetër u hoq nga ndërfaqja (kolona quhet tani \"Çmimi Offline\", te Cilësimet \"Markup-i Çmimit — Offline Flights\").",
      "Te faqja \"Offline Flights\" u shtua një veprim i ri masiv: pasi zgjedh disa fluturime, butoni \"Ndrysho Çmimet Offline\" lejon të ndryshosh çmimin Offline (override) për të gjitha fluturimet e zgjedhura njëherësh; po e le bosh, të gjitha kthehen në Auto (bazë + markup). Çmimi i foshnjës nuk preket.",
    ],
  },
  {
    version: "1.19",
    date: "2026-06-13",
    notes: [
      "Te faqja \"Offline Flights\", kolona \"Çmimi Offline\" tani mund të renditet (sort): kliko mbi titullin e kolonës për ta renditur fluturimet nga çmimi Offline më i ulët te më i larti dhe anasjelltas.",
    ],
  },
  {
    version: "1.18",
    date: "2026-06-13",
    notes: [
      "U shtua faqja e re (vetëm për admin) \"Offline Flights\" — një kopje e listës së fluturimeve me një kolonë shtesë \"Çmimi Offline\", që është çmimi i të rriturit për fluturimet offline. Çmimi Offline llogaritet automatikisht si çmimi bazë + një markup global (në % ose në €, i konfigurueshëm te Cilësimet → Markup-i Çmimit — Offline Flights; parazgjedhje 0 = pa ndryshim). Çdo fluturim mund të ketë edhe një override manual direkt te kolona. Çmimi i foshnjës NUK ndryshohet (mbetet bazë).",
    ],
  },
  {
    version: "1.17",
    date: "2026-06-13",
    notes: [
      "Rregullim: markup-i i agjentit (në € dhe në %) tani aplikohet GJITHMONË edhe për agjentët që kanë një rregull çmimi (Price Rule) aktiv. Më parë, nëse agjenti kishte një rregull çmimi aktiv, markup-i anashkalohej dhe çmimi i biletës dilte pa marzhin shtesë. Tani rregulli i çmimit përcakton çmimin neto, ndërsa markup-i shtohet sipër si marzh i agjencisë. Vlen për faqen e agjentit (booking-engine) dhe API-n e jashtëm.",
    ],
  },
  {
    version: "1.16",
    date: "2026-06-13",
    notes: [
      "Te forma \"Modifiko Agjentin\" (dhe te krijimi i agjentit) u shtua një fushë e re \"Markup (%)\" — një markup/marzh në PËRQINDJE që llogaritet mbi çmimin bazë të biletës. Është SHTESË mbi \"Markup (€)\" ekzistues (fiks): nëse vendos të dyja, aplikohen të dyja bashkë. Çmimi i biletës del DIREKT me marzhin e palosur brenda (njësoj si markup-i fiks), pa rresht të veçantë. Vlera 0 = pa ndryshim. Vlen vetëm për rezervimet e reja; çmimet te faqja e agjentit (booking-engine) e marrin automatikisht këtë markup.",
    ],
  },
  {
    version: "1.15",
    date: "2026-06-13",
    notes: [
      "Te lista e fluturimeve, butoni \"Ndrysho Vendet\" (për fluturime të zgjedhura) tani ndryshon vendet e LIRA (të disponueshme), jo më vendet totale. P.sh. nëse vendos 5, çdo fluturim i zgjedhur do të ketë 5 vende të lira; vendet e shitura nuk preken (totali rillogaritet automatikisht = të shitura + të lira).",
    ],
  },
  {
    version: "1.14",
    date: "2026-06-13",
    notes: [
      "Te detajet e rezervimit, butoni i gjelbër lart tani është thjesht \"Ruaj\" (më parë \"Ruaj dhe Mbyll\"). Kur e shtyp, ndryshimet ruhen dhe faqja MBETET e hapur — nuk mbyllet më vetvetiu. Pas ruajtjes, shiriti i ndryshimeve të paruajtura zhduket. Ruajtja automatike para daljes (kur tenton të dalësh me ndryshime të paruajtura) mbetet e pandryshuar.",
    ],
  },
  {
    version: "1.13",
    date: "2026-06-12",
    notes: [
      "Te lista e rezervimeve (tema premium), shifrat lart (Rezervime, Shitje, Profit, Pa Paguar, Pasagjerë) tani FILTROHEN sipas të njëjtit filtër date poshtë (Sot/Dje/7 ditët/30 ditët/Të gjitha ose periudhë specifike). Nuk ka më zgjedhës të veçantë \"Periudha e statistikave\" — një filtër i vetëm kontrollon njëkohësisht edhe kartat lart edhe tabelën poshtë. Titulli i çdo karte tregon periudhën e zgjedhur (p.sh. \"Rezervime sot\", \"Shitje 7 ditët\").",
    ],
  },
  {
    version: "1.12",
    date: "2026-06-12",
    notes: [
      "Chat-i i ekipit (butoni poshtë djathtas) tani është i ÇAKTIVIZUAR si parazgjedhje. U shtua një opsion i ri te Cilësimet → \"Chat i Ekipit\" ku mund ta aktivizoni ose çaktivizoni kur të doni. Kur është i çaktivizuar, butoni i bisedës fshihet nga të gjitha faqet.",
    ],
  },
  {
    version: "1.11",
    date: "2026-06-12",
    notes: [
      "Çmimi i FËMIJËS (CHD) nuk shkruhet më me dorë kur krijon ose modifikon një fluturim — vendoset gjithmonë i njëjtë me çmimin e ADULTIT dhe përditësohet vetvetiu kur plotëson adultin. Fusha tani është e kyçur te forma e modifikimit (paneli anësor) dhe te ndryshimi i çmimeve në grup. Nuk preket asgjë te fluturimet që vijnë nga partnerët.",
    ],
  },
  {
    version: "1.10",
    date: "2026-06-12",
    notes: [
      "Te lista e rezervimeve (tema premium), filtri i datës tani është AUTOMATIKISHT \"Sot\" kur hapet faqja — shfaqen menjëherë rezervimet e bëra sot. Mund ta heqësh me një klik te \"Të gjitha\" ose të zgjedhësh periudha të tjera.",
    ],
  },
  {
    version: "1.9",
    date: "2026-06-12",
    notes: [
      "Kutia jeshile e rezervimeve KOMPLET TË PAGUARA tani është me jeshile më të errët dhe pak më e vogël (më kompakte). Vlen në të dyja temat (klasike + premium), në desktop dhe mobile.",
    ],
  },
  {
    version: "1.8",
    date: "2026-06-12",
    notes: [
      "Te lista e rezervimeve, rezervimet KOMPLET TË PAGUARA (asgjë e mbetur) e shfaqin shumën në kolonën FINANCA brenda një kutie jeshile të lehtë, që dallohen menjëherë. Vlen në të dyja temat (klasike + premium), në desktop dhe mobile. Rezervimet me shumë të mbetur duken si më parë.",
    ],
  },
  {
    version: "1.7",
    date: "2026-06-12",
    notes: [
      "RREGULLIM KRITIK: kur ndryshon çmimin e biletës (çmimin e shitjes) te një rezervim ekzistues, markup-i NUK ri-shtohet më dhe ulja e agjentit NUK ri-aplikohet — totali bëhet saktësisht shuma e çmimeve të shtypura (− ulje manuale + taksa + ekstra). Më parë një rrugë e dytë e fshehur e llogaritjes ende e shtonte markup-in (p.sh. KTF7738: 160 → shfaqej 170).",
    ],
  },
  {
    version: "1.6",
    date: "2026-06-12",
    notes: [
      "Ulja dhe markup-i i agjentit tani zbatohen PËR ÇDO PASAGJER dhe palosen direkt në çmimin e biletës: çmimi që shihet = çmimi që paguhet = çmimi që ruhet, njësoj në kërkim, krijim (agjent dhe admin) dhe te detajet e rezervimit.",
      "Kur ndryshon një rezervim ekzistues, çmimi i shtypur mbetet final — ulja/markup-i NUK ri-zbatohen më (rregullon rastet ku totali ndryshonte vetë pas redaktimit, p.sh. KTF8547).",
      "Markup-i te krijimi nga admini tani vlen për pasagjer (× numri i pasagjerëve) në vend të një here për rezervim.",
    ],
  },
  {
    version: "1.5",
    date: "2026-06-12",
    notes: [
      "Te portali i agjentit, biletat e ANULLUARA nuk llogariten më në totalet poshtë listës (Gjithsej, Paguar, Mbetet) — njësoj si te kartat lart.",
    ],
  },
  {
    version: "1.4",
    date: "2026-06-12",
    notes: [
      "Te portali i agjentit, skeda 'Ndryshime Çmimi' (historiku i rritjeve/uljeve të çmimit) u fsheh — nuk shfaqet më për agjentin.",
    ],
  },
  {
    version: "1.3",
    date: "2026-06-12",
    notes: [
      "Gjetja e fluturimeve të reja tani përdor si parazgjedhje intervalin e SECILIT fluturim (periudhën që ke aktualisht), në vend të një interval të vetëm për të gjithë.",
      "Datat 'Nga' dhe 'Deri' u bënë opsionale: lëri bosh që çdo fluturim të kontrollohet brenda periudhës së vet, ose vendosi për të mbivendosur intervalin për të gjithë.",
    ],
  },
  {
    version: "1.2",
    date: "2026-06-12",
    notes: [
      "Te faqja 'Llojet e Fluturimeve' u shtua gjetja e fluturimeve të reja për disa kode njëherësh: zgjidh llojet, cakto intervalin, dhe kontrollohen në Google datat që nuk i ke.",
      "Rezultatet e gjetura RUHEN për secilin destinacion dhe rrinë në listë derisa t'i shtosh ose t'i heqësh — nuk fshihen kur del nga faqja.",
      "Lista e fluturimeve të reja shfaqet e grupuar sipas destinacionit, me mundësi shtimi (me çmime/vende opsionale) ose heqjeje nga lista.",
    ],
  },
  {
    version: "1.1",
    date: "2026-06-11",
    notes: [
      "Çmimi i biletës te pasagjeri tani ruhet (ngujohet) në momentin e shitjes. Ndryshimi i çmimit të fluturimit më vonë nuk prek biletat e shitura më parë.",
      "U shtua sistemi i Rregullave të Çmimeve të Agjentëve (çmime me kushte sipas rrugës, kompanisë ajrore, periudhës dhe agjentëve të zgjedhur).",
      "U shtua numri i versionit te menuja dhe historiku i përditësimeve te Cilësimet.",
    ],
  },
  {
    version: "1.0",
    notes: [
      "Versioni bazë i sistemit të menaxhimit të fluturimeve, rezervimeve, pagesave, agjentëve dhe raporteve.",
    ],
  },
];
