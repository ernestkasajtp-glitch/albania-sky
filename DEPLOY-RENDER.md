# Deploy në Render

Aplikacioni deploy-ohet si **një shërbim i vetëm** në Render (shih `render.yaml`):

| Adresa | Çfarë shërben |
|---|---|
| `/` | Portali publik i rezervimeve (booking-engine) |
| `/flight-system/` | Paneli FMS (flight-system) |
| `/api/...` | API server |

Kjo është e njëjta strukturë si `deploy/nginx.conf` në VPS, kështu që cookie-t dhe thirrjet `/api` punojnë pa ndryshime.

## Hapat

1. Hyr në https://dashboard.render.com (me GitHub).
2. **New → Blueprint** → zgjidh repo-n `albania-sky` → **Apply**.
   Render krijon shërbimin `albania-sky` dhe databazën `albania-sky-db`.
3. Te shërbimi → **Environment**, plotëso vlerat që kërkohen
   (`RAPIDAPI_KEY`, `SMTP_*`, `NOTIFY_EMAIL`, `GMAIL_FROM`, `FMS_PUBLIC_BASE_URL`)
   dhe çdo variabël tjetër që përdor në VPS (POK, OpenAI, CitizenPlane FTP, inbox-et, etj.).
4. **Databaza:** databaza e re është bosh. Të dhënat e vërteta janë në VPS.
   Kopjoji me `pg_dump` nga VPS dhe `pg_restore`/`psql` në "External Database URL" të Render:

   ```bash
   # në VPS
   pg_dump --no-owner --no-acl "$DATABASE_URL" > fms.sql
   # pastaj (nga VPS ose kompjuteri yt)
   psql "<External Database URL nga Render>" -f fms.sql
   ```
5. Pas restore, bëj **Manual Deploy → Restart** te shërbimi.

## Kufizime për t'u ditur

- **Skedarët e ngarkuar (`uploads/`)** ruhen në disk. Në Render disku fshihet në çdo deploy,
  përveç nëse shton një **Persistent Disk** (plan me pagesë) të montuar te
  `artifacts/api-server/uploads`.
- **PDF / Chromium:** gjenerimi i PDF-ve dhe biletave Wizz kërkon Chromium (`CHROMIUM_BIN`).
  Në Render Node runtime Chromium nuk është i instaluar; këto funksione nuk do punojnë derisa të kalojmë në Docker.
- **Planet falas** i "fikin" shërbimet pas mosaktivitetit dhe ndalojnë cron job-et. Përdor të paktën `starter`.
- **Kufizimi i IP-ve** për FMS (`fms_ip_blocks`) mbetet aktiv; Render dërgon IP-në reale te `X-Forwarded-For`.
