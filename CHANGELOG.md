# Jurnalul Hopper

Aici sunt consemnate schimbările zilnice ale proiectului, după data din România. Jurnalul este completat manual înainte de commit și push.

## 2026-10-08

### Revenire la email și parolă

- Readuse câmpurile de email și parolă, butonul „Intră în cont” și linkul „Ai uitat parola?”, la cererea utilizatorului.
- Înlocuite exemplele din câmpuri cu „Introdu email” și „Introdu parola”, cu traduceri în limbile aplicației.
- Adăugată recuperarea în aplicație prin cod pe email, confirmarea parolei noi și revenirea la conectare după salvare.
- Păstrate datele locale și verificarea identității pe server; parolele noi nu se salvează în înregistrările financiare.
- Pregătită migrarea SQL pentru conectarea cu parolă și actualizat ghidul de configurare. SMTP și verificarea emailurilor reale rămân de făcut.
- Trec 279 de teste, verificarea TypeScript și lint; formularul cu parolă și recuperare este servit în modul live. Nu a fost compilat sau instalat un APK nou.

### Conectare simplificată prin email (înlocuită ulterior)

- Înlocuită cerința Authenticator cu email și cod de șase cifre, la cererea utilizatorului.
- Eliminate câmpurile de parolă, QR-ul și cheia de configurare din autentificare.
- Păstrate conturile, datele financiare și sesiunile verificate; o sesiune veche cu parolă cere un cod nou.
- Adăugate retrimiterea cu pauză de 60 de secunde și mesaje pentru cod greșit, expirat, cerere anulată sau serviciu indisponibil.
- Pregătită migrarea SQL care înlocuiește cerința MFA cu verificarea metodei de conectare prin email și păstrează accesul numai la datele proprii.
- Verificată configurația publică a proiectului Supabase și actualizate resursele live, fără crearea de conturi sau trimiterea automată de emailuri.
- Actualizate testele, traducerile și ghidul. SMTP, șabloanele de email și verificarea fluxului real rămân de configurat.

### Pregătirea inițială 2FA (înlocuită ulterior)

- Pregătită autentificarea Supabase cu Google/Microsoft Authenticator, obligatorie pentru toate conturile.
- Adăugate confirmarea emailului prin cod în aplicație, retrimiterea codului și configurarea TOTP prin QR sau cheie.
- Păstrate datele conturilor locale la asocierea cu identitatea verificată; conturile noi nu salvează parola în datele locale.
- Blocat accesul la buget fără verificare, inclusiv pentru sesiuni locale vechi, resurse lipsă și răspunsuri întârziate după anulare.
- Separată autentificarea de sincronizarea financiară; conectarea nu activează încărcarea datelor.
- Adăugată migrarea SQL care cere MFA pentru accesul la datele online.
- Corectată restaurarea sesiunii de sincronizare pentru a ignora răspunsurile depășite.
- Adăugate teste pentru înregistrare, verificare, anulare, persistență și compatibilitatea conturilor.
- Documentată configurarea Supabase. Activarea pe un proiect real, livrarea emailurilor și verificarea pe telefon rămân de făcut.
- Clarificat că operațiunile Git sunt executate manual de utilizator.
- Corectate butoanele de conectare și înregistrare când configurarea lipsește: răspund cu un mesaj, iar avertizarea rămâne vizibilă la completare și schimbarea formularului.
- Explicat în formularul de conectare că urmează codul din Authenticator.

## 2026-10-07

### Control manual al modificărilor

- Eliminată sarcina Windows pentru trimiterea modificărilor și scripturile care făceau commit, push sau completau jurnalul.
- Păstrată verificarea opțională a fișierelor pregătite, fără modificări în Git.
- README-ul explică pașii pentru commit și push manual.
- Curățate mențiunile învechite din documentație și fișierele locale ale vechiului mecanism de trimitere.

### Istoric de publicare nou

- Versiune de bază a proiectului curent, cu un singur commit nou de publicare pe contul `anaprepelita`.
- Codul aplicației și documentația sunt păstrate.
- Copie de siguranță locală a istoricului anterior, păstrată în afara proiectului.

### Documentație în română

- Tradus integral README-ul în română, inclusiv titlurile, explicațiile și comentariile din exemple.
- Păstrate comenzile, legăturile și identificatorii tehnici.
- Actualizate mențiunile învechite despre APK-ul Android de test și culorile graficelor.

### Adăugat

- Repository public pentru Hopper pe contul GitHub `anaprepelita`.
- Verificări pentru fișiere private și chei de acces.
- Jurnal zilnic al schimbărilor.

### Modificat

- Destinația de publicare este remote-ul `student`, pe branchul `main`.
- Commiturile noi sunt atribuite contului de student prin adresa GitHub noreply.

### 14:48 — Documentație și verificări

- Actualizate convențiile proiectului și documentația.
- Extinse verificările pentru fișierele pregătite pentru publicare.

### 15:03 — Documentație în română

- Actualizat README-ul.
