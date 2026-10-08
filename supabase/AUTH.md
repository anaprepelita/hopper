# Autentificarea Hopper cu email și parolă

Utilizatorul intră în cont cu emailul și parola. Înregistrarea cere și numele, iar confirmarea emailului folosește un cod introdus direct în aplicație. Linkul „Ai uitat parola?” permite resetarea prin email, cod și alegerea unei parole noi.

Aceasta este autentificare cu un singur factor. Authenticator nu mai este obligatoriu.

## 1. Configurația locală

În fișierul `.env.local`, lângă `package.json`, completează:

```dotenv
VITE_SUPABASE_URL=https://ID_PROIECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_INLOCUIESTE
```

Fișierul este ignorat de Git. Nu introduce parole, chei `sb_secret_`, `service_role`, date SMTP sau coduri de conectare în aplicație ori în chat.

`npm.cmd run sync:cloud` generează configurația publică. La pornirea modului live și la build rulează automat. Dacă modifici numai `.env.local` în timpul unei sesiuni live, regenerează configurația și reconstruiește resursele live.

## 2. Activează conectarea prin email și parolă

În Supabase, **Authentication → Sign In / Providers → Email**, păstrează activată conectarea prin email și confirmarea adresei. Configurează minimum opt caractere pentru parole; serverul poate impune reguli suplimentare. Codurile de email trebuie să aibă șase cifre, conform formularului.

Conectarea folosește `signInWithPassword`, înregistrarea `signUp`, iar parola este gestionată de Supabase. Nu se verifică parola din vechile înregistrări locale.

Dacă Supabase respinge conectarea fără să distingă între un cont inexistent și o parolă greșită, Hopper afișează „Emailul sau parola sunt incorecte. Verifică-le sau creează un cont.” Aplicația nu deduce existența unui cont online din lista locală.

[Ghid Supabase pentru parole](https://supabase.com/docs/guides/auth/passwords), [conectare cu parolă](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).

## 3. Configurează trimiterea emailurilor

În **Authentication → Emails → SMTP Settings**, configurează serviciul de trimitere. Datele private SMTP se introduc numai în Supabase.

Serviciul implicit are limite mici și trimite numai către adresele membrilor echipei proiectului. Dacă Dashboardul afișează „Set up custom SMTP to edit templates”, configurează SMTP înainte de editarea șabloanelor. Conectarea unui cont deja confirmat nu cere un email la fiecare intrare; confirmarea și recuperarea parolei au nevoie de livrarea emailurilor.

[SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

### Variantă pentru teste: Gmail dedicat

Folosește o adresă separată pentru Hopper: destinatarii văd adresa expeditorului. Gmail poate servi testelor inițiale; înainte de publicare, verifică limitele și alege un serviciu potrivit numărului de utilizatori.

1. Creează contul Gmail dedicat aplicației.
2. Activează **Verificarea în doi pași** în acel cont Google. Cerința privește numai contul expeditorului; utilizatorii Hopper nu au nevoie de Authenticator.
3. Deschide [Parole pentru aplicații](https://myaccount.google.com/apppasswords) și generează una pentru Hopper.
4. Completează setările SMTP în Supabase:

| Câmp | Valoare |
| --- | --- |
| Sender email | Adresa Gmail dedicată |
| Sender name | Hopper |
| Host | `smtp.gmail.com` |
| Port | `587` (TLS/STARTTLS) |
| Username | Adresa Gmail completă |
| Password | Parola pentru aplicație generată la pasul 3 |

Nu folosi parola obișnuită Gmail. Parola pentru aplicație rămâne numai în Supabase; nu o pune în chat, Git sau `.env.local`.

[Ghid Google pentru parolele aplicațiilor](https://support.google.com/accounts/answer/185833?hl=ro), [setările SMTP Gmail](https://support.google.com/mail/answer/7104828?hl=en).

## 4. Șabloanele de confirmare și resetare

În **Authentication → Emails**, editează **Confirm signup** și **Reset password**. Ambele trebuie să includă `{{ .Token }}`, ca utilizatorul să poată introduce codul în aplicație. Un mesaj care conține numai un link nu este suficient pentru acest flux.

Pentru **Confirm signup**:

```html
<h2>Confirmă emailul pentru Hopper</h2>
<p>Introdu acest cod în aplicație:</p>
<p><strong>{{ .Token }}</strong></p>
<p>Dacă nu ai cerut înregistrarea, ignoră mesajul.</p>
```

Pentru **Reset password**:

```html
<h2>Resetează parola Hopper</h2>
<p>Introdu acest cod în aplicație, apoi alege parola nouă:</p>
<p><strong>{{ .Token }}</strong></p>
<p>Dacă nu ai cerut resetarea, ignoră mesajul.</p>
```

Hopper trimite cererea prin `resetPasswordForEmail`, verifică dovada prin `verifyOtp` cu tipul `recovery`, apoi schimbă parola prin `updateUser`. Nu este necesară o pagină web sau redirecționarea către localhost. Codurile expirate sunt respinse de server; retrimiterea are o pauză locală de 60 de secunde, suplimentară limitelor Supabase.

După schimbare, sesiunea de recuperare este închisă local și se afișează conectarea cu noua parolă. Accesul la buget rămâne blocat pe parcursul recuperării. Resetarea nu modifică înregistrările financiare și nu salvează parola în contul local.

[Șabloane email](https://supabase.com/docs/guides/auth/auth-email-templates), [resetare](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [verificare cod](https://supabase.com/docs/reference/javascript/auth-verifyotp), [actualizare parolă](https://supabase.com/docs/reference/javascript/auth-updateuser).

## 5. Regulile pentru datele online

În **SQL Editor → New query**, rulează în ordine:

1. [Schema sincronizării](migrations/202610040001_hopper_sync.sql).
2. [Migrarea pentru autentificarea cu parolă](migrations/202610080003_hopper_password_auth.sql).

Noua migrare înlocuiește politicile istorice care cereau MFA sau numai cod pe email. Accesul rămâne limitat la proprietarul rândului, cu identitate autentificată și email. Sunt acceptate parolele și sesiunile verificate prin email, inclusiv cele existente. Politicile de proprietar și permisiunile explicite rămân active.

Migrările intermediare sunt păstrate pentru istoricul proiectului. Pe un proiect nou, pașii de mai sus sunt suficienți. Dacă rulezi toate migrările în ordine, ultima stabilește regula curentă.

Autentificarea nu activează sincronizarea financiară și nu încarcă poze, parole vechi sau alte câmpuri private. Migrarea nu a fost executată automat în proiectul real.

## 6. Verificarea pe telefon

1. În modul live, salvează fișierele din `mobile/` și așteaptă reconstruirea.
2. Pentru resurse împachetate, oprește sesiunea live și rulează `npm.cmd run build`, apoi `npm.cmd run mobile:sync:android`. Actualizează aplicația fără dezinstalare. iOS necesită Mac și Xcode.
3. Înregistrare: introdu numele, emailul și o parolă de minimum opt caractere; confirmă emailul prin cod.
4. Conectare: introdu emailul și parola. Verifică mesajele pentru câmpuri goale și date greșite.
5. Recuperare: apasă „Ai uitat parola?”, corectează emailul dacă este necesar, verifică inboxul și Spam, introdu codul și alege o parolă nouă.
6. Verifică un cod greșit, unul expirat, retrimiterea, anularea și revenirea cu butonul Android Înapoi.
7. Intră cu parola nouă și confirmă păstrarea veniturilor, cheltuielilor, economiilor, valutei și pozei.

Testele automate simulează serviciul. Nu demonstrează livrarea reală a emailurilor, resetarea unui cont real sau aplicarea SQL în Supabase.

## Conturi existente și sesiuni

Contul local este asociat numai după validarea pe server a aceleiași adrese de email. Un cont legat de altă identitate sau alt proiect nu este suprascris. Datele financiare, valuta, poza și câmpurile vechi sunt păstrate; parolele noi nu se stochează în datele locale.

Un cont creat anterior fără parolă poate folosi „Ai uitat parola?” pentru a seta una, după verificarea emailului. Un cont exclusiv local trebuie mai întâi înregistrat online cu aceeași adresă. Nu există resetare locală care să ocolească Supabase.

Sesiunea validă este păstrată și reverificată pe server la pornire. Deconectarea explicită este respectată. O cerere care se termină după anulare nu deschide bugetul.

Conectarea și reverificarea la pornire necesită internet. După validare, operațiunile financiare locale pot funcționa fără internet. Autentificarea nu criptează automat datele locale.

Cheile `expenses_users`, `expenses_current_user`, copia nativă `hopper_accounts_v1` și originea aplicației rămân neschimbate.
