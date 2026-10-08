# Activarea rapoartelor private Hopper

Interfața este implementată, dar trimiterea pe email nu funcționează până la configurarea serviciilor de mai jos. Nu trebuie schimbată adresa personală în codul aplicației.

## 1. Creează cele două servicii

1. Creează un proiect la [Supabase](https://supabase.com/dashboard). Păstrează parola bazei de date în siguranță.
2. Creează un cont la [Resend](https://resend.com). Pentru publicare, verifică un domeniu propriu din secțiunea Domains și creează o cheie API cu permisiune de trimitere.
3. Pentru probe, Resend permite expeditorul de test doar către adresa contului Resend; acesta nu este un expeditor pentru publicare. Nu trimite cheile secrete în chat.

## 2. Pregătește baza de date

În proiectul Supabase: **SQL Editor → New query**. Copiază și execută conținutul fișierului `migrations/202610060001_hopper_problem_reports.sql`.

Acesta creează tabelele private și bucketul privat `hopper-problem-evidence`. Utilizatorii aplicației nu primesc acces direct la tabele sau fișiere. Migrarea pentru sincronizarea financiară este independentă și nu este necesară raportării.

## 3. Configurează funcția și emailul

Instalează [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) și autentifică-te. Din folderul proiectului:

```powershell
supabase login
supabase link --project-ref ID_PROIECT
```

Copiază `supabase/.env.example` într-un fișier privat `supabase/.env` și completează:

- `SUPPORT_TO`: adresa ta personală la care primești rapoartele.
- `SUPPORT_FROM`: expeditorul din domeniul verificat în Resend, de exemplu `Hopper <reports@domeniul-tau.ro>`.
- `RESEND_API_KEY`: cheia privată Resend.
- `SUPPORT_RATE_LIMIT_SALT`: un secret aleator de minimum 16 caractere.

Fișierul privat este ignorat de Git. Nu îl pune în `mobile/`, nu folosi prefixul `VITE_` pentru aceste valori și nu distribui fișierul. Setează secretele și publică funcția:

```powershell
supabase secrets set --env-file supabase/.env
supabase functions deploy report-problem
```

Supabase furnizează pe server `SUPABASE_URL` și `SUPABASE_SERVICE_ROLE_KEY`; cheia service role nu ajunge în aplicație. Endpointul de raportare este public și separat de autentificarea financiară; serverul aplică validarea fișierelor și limitele de trimitere. Configurația `verify_jwt = false` este în `supabase/config.toml`; accesul la date rămâne exclusiv pe server.

## 4. Conectează aplicația

În **Supabase → Project Settings → API Keys**, copiază cheia **publishable**. În fișierul local `.env.local` din rădăcina Hopper, adaugă cele două valori din `.env.reports.example`:

```dotenv
VITE_HOPPER_REPORTS_URL=https://ID_PROIECT.supabase.co/functions/v1/report-problem
VITE_HOPPER_REPORTS_PUBLISHABLE_KEY=sb_publishable_VALOAREA_TA
```

Acestea sunt valori publice. Nu pune aici adresa destinatarului, cheia Resend sau o cheie secretă Supabase. Scriptul de construire refuză cheile secrete pentru resursele aplicației.

Reconstruiește și actualizează APK-ul:

```powershell
npm.cmd run android:apk:debug
```

Pentru publicare folosește comenzile de distribuție și configurarea semnării descrise în README. iOS necesită reconstruirea în Xcode pe Mac.

## 5. Verifică după activare

Din aplicația instalată: **Profil și setări → Raportează o problemă**. Trimite un raport de probă cu o imagine fără informații personale. Verifică inboxul și spamul. Primirea de către serviciul de email nu garantează că mesajul ajunge în inbox; monitorizează și evenimentele de livrare din Resend.

Atașamentele sunt maximum trei, maximum 20 MB în total: poze JPG/PNG/WebP de maximum 5 MB și clipuri MP4/MOV/WebM de maximum 15 MB. Nu se încarcă automat poze de profil, tranzacții, parole sau date ale conturilor.

## Confidențialitate și întreținere

- Destinatarul și cheile rămân în secretele serverului, nu în APK, interfață sau răspunsurile API.
- Fișierele sunt private; Resend le primește prin linkuri semnate valabile 24 de ore și le atașează emailului. Fișierele trimise sunt astfel procesate și de furnizorul de email.
- Limitele sunt cinci încercări pe IP/oră și 100 pe zi pentru întregul proiect. Se păstrează numai un hash al IP-ului cu secret separat, nu IP-ul brut.
- Reîncercările folosesc același identificator și același mesaj de email, cu idempotency Resend. Sunt maximum cinci încercări în 23 de ore. Un raport deja acceptat nu produce alt email.
- Rapoartele și fișierele rămân în Supabase până sunt șterse de administrator. Nu este implementată ștergerea automată. Stabilește o perioadă de păstrare și șterge din Storage dosarele rezolvate, apoi înregistrările corespunzătoare din tabele.
- Limitele reduc abuzul, dar endpointul public nu autentifică identitatea unui autor. Verifică consumul, rapoartele eșuate și limitele proiectului înainte de publicare.
- Testele locale folosesc servicii simulate. Migrarea și livrarea reală trebuie verificate în proiectul configurat; nu au fost publicate sau executate automat.

Documentație: [Supabase și email](https://supabase.com/docs/guides/functions/examples/send-emails), [Storage privat](https://supabase.com/docs/guides/storage/security/access-control), [Resend: trimitere](https://resend.com/docs/api-reference/emails/send-email), [Idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

Autentificarea cu email și parolă și recuperarea prin cod pe email are un [ghid separat de configurare](AUTH.md).
