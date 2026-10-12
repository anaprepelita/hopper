# Autentificarea Hopper cu Google

Conectarea se face prin Google și o sesiune Supabase verificată pe server. Datele conturilor existente sunt păstrate; formularele istorice rămân în cod pentru compatibilitate.

## 1. Configurația locală

În fișierul .env.local, lângă package.json, completează URL-ul și cheia publică din același proiect Supabase:

~~~dotenv
VITE_SUPABASE_URL=https://ID_PROIECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_INLOCUIESTE
~~~

Fișierul este ignorat de Git. Nu introduce chei secrete, secretul Google OAuth în configurația aplicației ori în chat. Comanda **npm.cmd run sync:cloud** generează configurația publică; buildurile o actualizează automat.

## 2. Configurează Google

Google necesită configurarea inițială a clientului OAuth și a furnizorului Supabase.

1. În Supabase, deschide **Authentication → Sign In / Providers → Google** și copiază adresa Callback URL afișată.
2. Deschide [Google Cloud Console](https://console.cloud.google.com/) și creează sau selectează proiectul pentru Hopper.
3. Configurează **Google Auth Platform**: numele Hopper, un email dedicat pentru suport și audiența aplicației. Pentru testare externă, adaugă conturile de test în lista permisă. Cere numai informațiile de bază pentru conectare: openid, email și profile.
4. În **Clients**, creează un client OAuth de tip **Web application**. Fluxul folosește pagina Supabase în browserul securizat al sistemului.
5. La **Authorized redirect URIs**, adaugă exact adresa Callback URL copiată la pasul 1, de forma **https://ID_PROIECT.supabase.co/auth/v1/callback**.
6. Copiază Client ID și Client secret în formularul Google din Supabase. Secretul rămâne numai în Supabase. Activează furnizorul și salvează.
7. În Supabase, **Authentication → URL Configuration → Redirect URLs**, adaugă **ro.hopper.budget://auth/google** și **ro.hopper.budget://auth/google?attempt=*** pentru revenirea cu identificatorul încercării. Nu este necesară o pagină web sau o adresă localhost pentru acest flux.
8. Reconstruiește și actualizează aplicația nativă; noul plugin și legăturile Android/iOS necesită o actualizare instalată, nu doar reîncărcarea HTML.

Google se deschide prin Capacitor Browser. Clientul Supabase folosește PKCE S256, fără citirea automată a URL-ului WebView. Callbackul trebuie să corespundă încercării locale active. Codurile din alte scheme, gazde, căi, încercări sau fragmente nu sunt acceptate. Accesul necesită verificarea exactului token pe server, email confirmat, metoda OAuth și identitate Google.

Callbackul poate fi procesat și după redeschiderea aplicației, dacă încercarea și verificatorul PKCE sunt încă disponibile pe același dispozitiv. Încercarea locală expiră după zece minute; codul serverului poate expira mai devreme. Anularea nu șterge bugetele și nu permite un răspuns întârziat să deschidă aplicația.

[Ghid Supabase pentru Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [legături native](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

## 3. Datele online opționale

Autentificarea nu activează sincronizarea financiară. Pentru o bază nouă, aplică mai întâi migrarea 202610040001_hopper_sync.sql, apoi 202610120002_hopper_google_auth.sql. Aceasta păstrează accesul numai la datele proprii și acceptă sesiunile Google OAuth și sesiunile istorice verificate.

## 4. Verificare

Testează conectarea pe dispozitiv, revenirea din browser, anularea, răspunsurile întârziate și redeschiderea Hopper. Conectarea Google și păstrarea sesiunii după redeschidere au fost confirmate pe Samsung. Resursele iOS sunt pregătite; compilarea și testarea iOS necesită Mac și Xcode.
