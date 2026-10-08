# Configurarea autentificării Hopper cu doi factori

Codul este pregătit pentru Supabase Auth și Google/Microsoft Authenticator. Configurarea unui proiect real și testarea pe telefon sunt necesare înainte de distribuirea acestei versiuni. Fără configurare, aplicația păstrează datele existente și afișează că autentificarea securizată nu este disponibilă; nu folosește parola locală ca alternativă.

## 1. Creează proiectul

1. Deschide [Supabase Dashboard](https://supabase.com/dashboard) și conectează-te.
2. Apasă **New project**, alege organizația și numele **Hopper**.
3. Alege o parolă pentru baza de date și păstreaz-o într-un manager de parole. Nu o introduce în aplicație sau în Git.
4. Alege o regiune apropiată de utilizatori și așteaptă crearea proiectului.

Dacă ai deja un proiect Hopper, folosește-l pentru a păstra identitățile conturilor existente.

## 2. Configurează emailul de confirmare

În **Authentication**, păstrează activată autentificarea prin email și confirmarea emailului. Confirmarea adresei este primul pas al înregistrării; factorul suplimentar rămâne codul din Authenticator.

În **Email Templates → Confirm signup**, folosește un mesaj cu cod de șase cifre. Un exemplu minimal:

```html
<h2>Confirmă contul Hopper</h2>
<p>Introdu acest cod în aplicația Hopper:</p>
<p><strong>{{ .Token }}</strong></p>
<p>Dacă nu ai cerut acest cod, ignoră mesajul.</p>
```

Aplicația verifică acest cod prin `auth.verifyOtp` și continuă cu configurarea Authenticator. În acest flux nu este necesară o pagină web de confirmare sau o redirecționare către localhost.

Serviciul de email implicit Supabase trimite numai către adresele membrilor echipei și are limite mici. Pentru utilizatori reali, configurează **Custom SMTP** în Supabase, cu un expeditor verificat. Datele SMTP rămân în Supabase. Consultă [configurarea oficială SMTP](https://supabase.com/docs/guides/auth/auth-smtp) și [șabloanele de email](https://supabase.com/docs/guides/auth/auth-email-templates).

## 3. Păstrează TOTP activ

TOTP este activ implicit în proiectele Supabase. Păstrează posibilitatea de înrolare și verificare a factorilor TOTP. Aplicația cere tuturor conturilor un factor TOTP verificat și o sesiune la nivelul `aal2` înainte de deschiderea bugetului. Nu există opțiune de dezactivare a 2FA în Hopper.

Supabase verifică și limitează încercările de autentificare. Codurile și cheia de configurare nu sunt scrise în datele financiare sau în jurnal.

## 4. Completează configurația locală

În setările API ale proiectului Supabase găsești **Project URL** și cheia **publishable**. În VS Code, copiază `.env.example` într-un fișier `.env.local` și completează valorile publice:

```dotenv
VITE_SUPABASE_URL=https://ID_PROIECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_INLOCUIESTE
```

Fișierul `.env.local` este ignorat de Git. Nu pune aici parola bazei de date, o cheie `sb_secret_`, cheia `service_role`, date SMTP sau coduri Authenticator. Scriptul de construire include numai configurația publică și refuză cheile de server.

## 5. Aplică protecția datelor online

În **SQL Editor → New query**, rulează în ordine conținutul fișierelor:

1. [Schema existentă pentru sincronizare](migrations/202610040001_hopper_sync.sql).
2. [Politica obligatorie MFA](migrations/202610080001_hopper_mfa.sql).

A doua migrare adaugă o politică RLS restrictivă care cere `aal2` pentru citire, inserare și actualizare. Se aplică și funcției existente de salvare, care rulează cu permisiunile utilizatorului. Politicile de proprietar rămân active.

Aceste migrări pregătesc tabelul pentru conturile deja legate la sincronizare. Simpla activare a autentificării 2FA nu leagă conturile locale la sincronizarea financiară și nu le încarcă înregistrările sau pozele.

## 6. Verifică și reconstruiește aplicația

Din terminalul proiectului:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run mobile:sync:android
```

Recompilează și actualizează aplicația Android prin metoda de dezvoltare existentă. Păstrează același identificator, aceeași origine de stocare și aceeași semnătură; nu dezinstala aplicația și nu șterge datele. Pentru iOS, sincronizarea și compilarea se fac pe Mac.

Testează pe un cont de probă:

- Înregistrarea, primirea emailului, codul greșit, expirarea și retrimiterea codului.
- Configurarea TOTP prin QR pe alt ecran sau prin copierea cheii pe același telefon.
- Codul Authenticator greșit, apoi unul corect.
- Anularea în timpul verificării și revenirea cu butonul Android.
- Deconectarea, reconectarea și redeschiderea aplicației.
- Lipsa internetului înainte de conectare: bugetul rămâne blocat, iar datele sunt păstrate.
- Păstrarea sumelor, valutelor, pozei și metadatelor unui cont local vechi.

Testele automate folosesc un serviciu Supabase simulat. Ele nu confirmă livrarea reală a emailului, politicile aplicate pe server sau comportamentul Android/iOS pe dispozitive.

## Conturile locale existente

La prima utilizare a versiunii cu 2FA, înregistrează și confirmă aceeași adresă de email în Supabase, apoi configurează Authenticator. Dacă identitatea Supabase există deja, conectează-te la ea.

După verificarea emailului și a TOTP, Hopper asociază identitatea cu înregistrările locale care au același email. Păstrează cheile `expenses_users`, `expenses_current_user`, copia nativă, sumele, valutele, poza și câmpurile vechi. Identitatea folosește câmpurile separate `authAccountId` și `authProject`; un cont legat deja la altă identitate nu este înlocuit.

Parolele conturilor noi sunt verificate de Supabase și nu sunt salvate în înregistrările locale Hopper. Câmpurile vechi de parolă rămân pentru compatibilitatea datelor, dar nu pot fi folosite pentru a ocoli autentificarea online.

Conectarea și verificarea sesiunii la pornire necesită internet. După deschiderea unei sesiuni verificate, operațiunile financiare rămân locale. 2FA protejează autentificarea; nu criptează copiile locale de date.

## Recuperarea accesului

Această versiune nu oferă coduri de recuperare sau resetarea automată a factorului TOTP. Înainte de lansare, stabilește un canal de suport și o procedură de verificare a identității pentru pierderea telefonului sau a aplicației Authenticator.

Recuperarea administrativă trebuie făcută numai după verificarea identității, folosind instrumentele serverului Supabase. Un reset de parolă nu trebuie să dezactiveze 2FA. După eliminarea administrativă a unui factor pierdut, Hopper cere configurarea unui factor nou înainte de a deschide bugetul. Nu distribui cheile administrative în aplicație.

Documentație: [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [impunerea MFA pe server](https://supabase.com/docs/guides/auth/auth-mfa), [verificarea codului de email](https://supabase.com/docs/reference/javascript/auth-verifyotp).
