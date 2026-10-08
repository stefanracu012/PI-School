# PISchool

Platformă de management pentru cursuri after-school, dezvoltată cu Next.js 15, Prisma și MongoDB.

## 🚀 Funcționalități

- **Portal Public**: Prezentare cursuri, recenzii, formular înscriere
- **Portal Admin**: Gestiune cursuri, elevi, profesori, grupuri, plăți, recuperări
- **Portal Profesor**: Prezențe, grupuri, elevi, recuperări
- **Autentificare**: NextAuth.js cu credențiale și Google OAuth

## 🧭 CRM (adus de la Olla English)

Panoul `/admin` și `/teacher` sunt CRM-ul complet de la Olla English, 1 la 1:
Leads (pipeline vânzări, follow-up, lecții de probă), Elevi, Grupe (plată lunară
sau individuală, pachete de lecții, încheiere grupă), Orar, Sesiuni, Recuperări,
Plăți, Statistică, Mesaje/Reclame Meta, Securitate, Audit.

Diferențe față de Olla:

- **Nivelurile** sunt ale PI School (`lib/levels.js`): Clasa pregătitoare, Clasele 1–12,
  Evaluare Națională, Bacalaureat, Liceu, Universitate, Olimpiadă.
- **Site-ul public** (cursuri, recenzii, înscriere) rămâne al PI School; formularele de pe
  site (`/inscriere`, cursuri, contact) intră automat ca lead-uri cu sursa SITE.
- Paginile admin **Cursuri (site)** și **Recenzii (site)** administrează site-ul;
  **Înscrieri vechi** și **Contact vechi** sunt arhiva dinainte de CRM.

### Migrarea datelor vechi

La prima pornire după deploy, aplicația completează automat câmpurile noi pe
documentele vechi (altfel Prisma dă eroare la citire), importă înscrierile și
mesajele vechi ca lead-uri și repară rândurile orfane: grupele/recuperările al căror
profesor a fost șters direct din baza de date trec pe „⚠️ Profesor șters” (mută-le din
admin pe un profesor real), iar rândurile legate de grupe/elevi/lecții inexistente se
șterg. Fiecare pas rulează o singură dată (marcaj în `external_cache`),
e idempotentă și se poate forța manual cu `npm run db:migrate-crm`.
Indexurile noi se creează cu `npm run db:push`.

### Botul de salarii

Un bot Telegram separat, doar pentru salariile profesorilor. Fiecare grupă are o regulă de plată
(sumă fixă pe lecție sau sumă × elevi prezenți), setată la crearea/editarea grupei. Când
lecția e salvată, suma intră singură în salariul profesorului, iar el primește mesaj cu
motivul. Adminii cu dreptul **Gestionează salariile** (și superadminii) văd în bot toți
profesorii, istoricul pe luni și de la început, adaugă bonusuri, corectează și scot salariul.

1. Creează botul la [@BotFather](https://t.me/BotFather) și pune token-ul în `TELEGRAM_SALARY_BOT_TOKEN`
2. După deploy: `npm run telegram:salary-webhook https://pischool.md`
3. Fiecare admin și profesor deschide botul și apasă **Start**. Contul se recunoaște după
   Telegram-ul conectat în CRM (Securitate → Telegram).

### Cron-uri (cron-job.org)

Cron-urile rulează din cron-job.org, nu din Vercel (`vercel.json` e gol intenționat).
Fiecare job face `GET` cu header-ul `Authorization: Bearer <CRON_SECRET>`:

| URL | Program (UTC) |
|---|---|
| `https://pischool.md/api/cron/notifications` | zilnic 06:00 |
| `https://pischool.md/api/cron/lead-followups` | la fiecare 10 minute |
| `https://pischool.md/api/cron/meta-leads` | la fiecare 15 minute (doar cu Meta configurat) |

## 📋 Cerințe

- Node.js 18.17 sau mai nou
- MongoDB Atlas (sau MongoDB local)
- (Opțional) Cont Google Cloud pentru OAuth

## 🛠️ Instalare Development

```bash
# Clonează repository-ul
git clone <repo-url>
cd bravitoafterschool

# Instalează dependențele
npm install

# Copiază fișierul de mediu
cp .env.example .env

# Configurează variabilele în .env:
# - DATABASE_URL (MongoDB connection string)
# - NEXTAUTH_SECRET (generează cu: openssl rand -base64 32)
# - NEXTAUTH_URL=http://localhost:3000

# Generează Prisma client și push schema
npm run db:push

# (Opțional) Populează baza de date cu date demo
npm run db:seed

# Pornește serverul de development
npm run dev
```

Deschide [http://localhost:3000](http://localhost:3000) în browser.

## 🏭 Production Build

```bash
# Build pentru producție
npm run build

# Pornește serverul de producție
npm start
```

## 📦 Deployment

### Vercel (Recomandat)

1. Push codul pe GitHub/GitLab
2. Importă proiectul în [Vercel](https://vercel.com)
3. Configurează variabilele de mediu:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` (domeniul tău)
   - `NEXTAUTH_SECRET`
   - `GOOGLE_CLIENT_ID` (opțional)
   - `GOOGLE_CLIENT_SECRET` (opțional)
4. Deploy!

### Docker

```dockerfile
# Dockerfile example
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

### VPS / Server

```bash
# Pe server
git pull
npm ci --production
npm run build
pm2 start npm --name "bravito" -- start
```

## 📝 Variabile de Mediu

| Variabilă              | Descriere                            | Obligatoriu |
| ---------------------- | ------------------------------------ | ----------- |
| `DATABASE_URL`         | MongoDB connection string            | ✅          |
| `NEXTAUTH_URL`         | URL-ul aplicației                    | ✅          |
| `NEXTAUTH_SECRET`      | Secret pentru JWT                    | ✅          |
| `GOOGLE_CLIENT_ID`     | Google OAuth Client ID               | ❌          |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret                  | ❌          |
| `NODE_ENV`             | Environment (production/development) | ✅          |

## 🔒 Checklist Producție

- [ ] Generează un `NEXTAUTH_SECRET` nou pentru producție
- [ ] Configurează `NEXTAUTH_URL` cu domeniul de producție
- [ ] Setează `NODE_ENV=production`
- [ ] Configurează MongoDB Atlas IP whitelist
- [ ] Activează backup automat în MongoDB Atlas
- [ ] Configurează Google OAuth redirect URIs pentru producție
- [ ] Testează endpoint-ul `/api/health`
- [ ] Configurează SSL/HTTPS
- [ ] Setează rate limiting la nivel de CDN/proxy

## 📁 Structura Proiectului

```
├── app/                  # Next.js App Router
│   ├── admin/           # Portal administrator
│   ├── teacher/         # Portal profesor
│   ├── api/             # API routes
│   └── inscriere/       # Formular public înscriere
├── components/          # React components
├── lib/                 # Utilities (prisma, auth)
├── prisma/              # Prisma schema & seed
└── public/              # Static files
```

## 🔧 Scripts Disponibile

| Script              | Descriere                         |
| ------------------- | --------------------------------- |
| `npm run dev`       | Pornește serverul de development  |
| `npm run build`     | Build pentru producție            |
| `npm start`         | Pornește serverul de producție    |
| `npm run lint`      | Verifică codul cu ESLint          |
| `npm run lint:fix`  | Corectează automat erorile ESLint |
| `npm run db:push`   | Push schema Prisma la database    |
| `npm run db:seed`   | Populează database cu date demo   |
| `npm run db:studio` | Deschide Prisma Studio            |

## 📞 Suport

Pentru întrebări sau probleme, contactează echipa de dezvoltare.

## 📄 Licență

Proprietar - Bravito After School
