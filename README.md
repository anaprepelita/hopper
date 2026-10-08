# Hopper

Hopper este o aplicație de buget pentru studenți, cu interfață în română, engleză, franceză și rusă. Permite înregistrarea burselor, sprijinului din familie, veniturilor din muncă, cheltuielilor și obiectivelor de economii. Totalurile lunare, diagrama pe categorii și rapoartele folosesc tranzacțiile salvate; conturile noi pornesc fără solduri demonstrative.

Pe telefoanele cu ecrane de până la 720 px, aplicația are o bară de navigare în partea de jos, cu patru butoane, un antet compact cu numele aplicației și poza de profil, un rezumat al bugetului în două coloane și dialoguri care se deschid de jos. Temele pastel, titlurile pixelate, mascotele, traducerile și formularele financiare sunt păstrate. Pentru sesiunea curentă, fiecare pagină își păstrează poziția de derulare. Bara de navigare se retrage când apare tastatura. Conținutul și confirmările lasă spațiu pentru navigare și zonele protejate ale ecranului pe Android și iOS. Pe tablete se păstrează aranjarea mai largă.

## Conturi și păstrarea datelor

Înregistrările locale ale conturilor și ultima sesiune deschisă folosesc în continuare cheile `expenses_users` și `expenses_current_user` din localStorage. Înainte de încărcarea scripturilor financiare este pregătită o copie locală nativă prin `@capacitor/preferences`, cu cheia `hopper_accounts_v1`. Copia se actualizează după modificarea conturilor, poate restaura înregistrările lipsă din WebView la următoarea pornire și păstrează modificările locale mai recente și deconectarea cerută de utilizator. Pozele rămân pe dispozitiv. Conturile noi folosesc email și parolă verificate de Supabase; parolele introduse nu sunt salvate local, iar câmpurile vechi sunt păstrate pentru compatibilitate. O copie locală a utilizatorului nu permite conectarea fără o sesiune verificată de Supabase.

Dacă citirea datelor eșuează, aplicația oferă reîncercarea, în loc să afișeze o listă aparent goală de conturi. Dacă actualizarea copiei native eșuează, datele locale sunt păstrate și se poate reîncerca. Dezinstalarea sau ștergerea tuturor datelor aplicației elimină ambele copii. Acest mecanism păstrează datele pe dispozitiv; sincronizarea între dispozitive necesită configurarea separată a serviciului Supabase.

## Buget și cheltuieli

Adăugarea unei cheltuieli afișează o confirmare temporară, fără să mărească formularul. Cheltuielile individuale sunt listate numai în pagina **Cheltuieli**. Pagina principală își actualizează imediat totalurile, diagrama pe categorii și calendarul.

Fiecare cheltuială din **Cheltuieli** are un buton **Șterge**. Ștergerea actualizează imediat contul salvat, totalurile, diagrama și calendarul, inclusiv pentru înregistrările salvate înainte de adăugarea acestei funcții.

Fiecare venit din **De unde vin banii?**, pe pagina **Bugetul meu**, are butoanele **Modifică** și **Șterge**. Ștergerea elimină doar înregistrarea aleasă, recalculează venitul disponibil după economii și soldul rămas și actualizează detaliile zilei. Veniturile vechi identice sunt șterse pe rând, folosind poziția lor originală în listă. Celelalte date și valute, cheltuielile, limitele de buget, contribuțiile la economii, obiectivele și informațiile contului rămân păstrate.

Butoanele care se referă la înregistrări schimbate între timp sau la alt cont nu pot șterge acele date. Dacă salvarea eșuează, ștergerea este anulată. Rezumatul sumelor puse deoparte pentru economii nu are buton de ștergere a veniturilor. Acțiunea folosește aceeași sincronizare opțională ca celelalte modificări locale.

Cheltuielile și veniturile salvate au și butonul **Modifică**. Dialogul completează automat descrierea sau sursa, suma, categoria pentru cheltuieli și data. Salvarea înlocuiește înregistrarea și actualizează imediat totalurile, culorile calendarului și graficele. Valuta, câmpurile fără legătură cu modificarea și valorile vechi ale datei sau categoriei care nu au fost schimbate rămân păstrate. Anularea și erorile de validare nu modifică datele. O înregistrare schimbată între timp sau schimbarea contului împiedică editarea; dacă salvarea eșuează, formularul rămâne deschis cu valorile introduse.

## Profil, teme și valută

**Profil și setări** include trei teme: **Grădină pastel**, **Apus piersică** și **Noapte lila**. Alegerea unei teme o salvează imediat pentru contul curent. La deconectare revine tema implicită, Grădină pastel. Temele necunoscute sunt înlocuite cu tema implicită. Schimbarea temei păstrează toate înregistrările financiare și culorile calendarului care indică nivelul cheltuielilor.

Fiecare cont poate salva un nume afișat, universitatea, anul de studiu și valuta preferată: RON, EUR, USD, GBP sau CHF. Tranzacțiile, bugetele și economiile rămân în valuta lor originală. Preferința stabilește valuta folosită pentru introducere și afișare, fără conversie la curs valutar. Sumele vechi fără valută sunt tratate ca RON.

Anul de studiu, valuta și sursa venitului folosesc dialoguri retro cu același aspect, navigare din tastatură și revenirea focalizării la selector după închidere. Alegerea valutei actualizează câmpul; **Salvează valuta** aplică și memorează preferința.

## Autentificare și recuperarea parolei

Autentificarea se deschide direct pe formularul de conectare, fără butoanele duplicate de conectare și înregistrare de deasupra. Butoanele retro pastel de sub formulare permit trecerea între înregistrare și conectare și focalizează primul câmp.

Conectarea cere emailul și parola, cu butonul „Intră în cont”. Câmpurile afișează „Introdu email” și „Introdu parola”. Înregistrarea cere și numele, o parolă de minimum opt caractere și confirmarea emailului prin cod. Mesajele pentru date greșite sau lipsa internetului apar în formular. Nu este obligatoriu Authenticator.

Linkul „Ai uitat parola?” deschide recuperarea în aplicație: email → cod → parolă nouă și confirmare. După salvare apare mesajul de succes în stilul aplicației și se revine la conectarea cu noua parolă. Codurile incorecte sau expirate nu deschid contul; retrimiterea devine disponibilă după 60 de secunde.

Dashboardul se deschide numai după validarea pe server a sesiunii și a emailului confirmat. Sesiunile valide sunt păstrate și reverificate la pornire. Recuperarea și anularea nu modifică datele financiare. Fără configurația Supabase sau resursele de autentificare, aplicația păstrează datele și rămâne blocată la conectare.

**Confirmarea și recuperarea necesită emailuri funcționale.** Configurează SMTP și șabloanele „Confirm signup” și „Reset password”, cu codul în mesaj. Pașii și migrarea SQL curentă sunt în [ghidul de autentificare](supabase/AUTH.md). Conturile locale vechi se asociază după verificarea aceleiași adrese, păstrând datele și poza; un cont online creat fără parolă poate seta una prin recuperare. Autentificarea nu activează sincronizarea financiară.

Mesajele pentru email lipsă, adresă invalidă, cod greșit sau expirat, limite de trimitere și indisponibilitatea serviciului rămân distincte. Conturile nu sunt identificate din lista locală înainte de verificare.

Celelalte formulare afișează avertizări în limba aleasă lângă câmpurile obligatorii necompletate. Pentru suma unui venit sau a unei cheltuieli, mesajul în română este **Completează suma.** Salvarea focalizează primul câmp invalid și păstrează valorile introduse, fără să salveze înregistrări incomplete. Avertizările dispar după corectare; câmpurile opționale rămân opționale. Sunt verificate și formatul emailului, sumele pozitive și precizia de maximum două zecimale.

## Economii

În **Economii**, se salvează mai întâi numele obiectivului și suma țintă, apoi fiecare contribuție nouă este introdusă prin **Adaugă la economii**. Contribuțiile se acumulează în valuta aleasă, iar cardul afișează **Ai strâns X din Y**. După o salvare reușită, câmpul contribuției se golește.

Fiecare contribuție nouă primește data adăugării și se scade o singură dată din venitul afișat și soldul rămas pentru luna și valuta respectivă. Lista veniturilor arată suma pusă deoparte. Veniturile originale și cheltuielile rămân păstrate. Editarea obiectivului păstrează economiile acumulate; economiile vechi fără dată nu sunt scăzute retroactiv.

Economiile nu mai au un selector de ilustrații sau o scenă decorativă. Informațiile existente despre obiectiv și sumele acumulate rămân păstrate.

După atingerea obiectivului, **Începe un obiectiv nou** deschide un formular gol. Anularea sau o salvare invalidă ori eșuată păstrează obiectivul curent. Salvarea pornește noul obiectiv de la zero și arhivează obiectivul împlinit și informațiile sale în `completedSavingsGoals`, cu o identitate separată în `savingsGoalIds` pentru fiecare valută.

Editarea numelui sau a țintei și adăugarea unor economii suplimentare la un obiectiv atins nu înregistrează încă o împlinire. Obiectivele vechi deja atinse sunt recunoscute și arhivate la o acțiune legată de economii; simpla navigare nu migrează datele. Istoricul veniturilor și contribuțiilor rămâne neschimbat, astfel încât pornirea unui obiectiv nou nu scade economiile încă o dată.

## Reușite

**Micile tale reușite** include cele trei insigne originale și încă șaisprezece reușite:

- Progresul obiectivului la 25%, 50%, 75% și 90%.
- Trei sau zece contribuții la economii.
- Economisirea în trei zile diferite.
- Economisirea în două săptămâni consecutive, de luni până duminică.
- Economisirea în trei luni calendaristice consecutive.
- Economisirea a 5% sau 10% din venitul brut lunar.
- Un sold pozitiv într-o lună încheiată.
- Încadrarea tuturor cheltuielilor în categorii.
- Crearea unei categorii personalizate.
- Revenirea după o pauză de cel puțin 30 de zile calendaristice.
- Împlinirea a două obiective diferite.

Procentele raportate la venit și soldurile rămase țin cont de scăderea economiilor și compară doar înregistrările din aceeași lună și valută, fără totaluri convertite. Seriile săptămânale sau lunare și pauzele dintre contribuții se calculează separat pe valută. Numărul contribuțiilor și al zilelor distincte poate include mai multe valute, fără să adune sumele. Reușitele dependente de dată ignoră înregistrările fără dată, invalide, imposibile sau viitoare. O listă goală de cheltuieli nu primește insigna pentru categorisire.

Insignele sunt calculate la afișare, fără salvarea datelor. După o actualizare reușită a contului, insignele obținute sunt păstrate în câmpul `achievementState.earned`. Un obiectiv nou sau o editare ulterioară nu elimină o reușită deja câștigată. Câmpurile și înregistrările existente rămân intacte. Dacă salvarea eșuează, sunt anulate atât schimbările financiare, cât și cele ale reușitelor. Nu există penalizări pentru întreruperea seriilor sau clasamente între utilizatori.

Titlul reușitelor folosește caractere românești normale **Ș/ș**, cu un font suplimentar local în `mobile/app/fonts/hopper-romanian-pixel.ttf`. Caracterele compuse păstrează literele pixelate originale și virgula diacritică; nu sunt desenate litere sau semne de punctuație prin CSS. Fontul derivat se numește Hopper Romanian Pixel și include licența SIL Open Font License în `mobile/app/fonts/OFL.txt`. Scriptul `scripts/build-romanian-font.py` îl regenerează din fontul original Press Start 2P folosind Python și fontTools. Fontul generat este inclus în proiect; comenzile obișnuite npm nu necesită Python.

Cardurile reușitelor au nouăsprezece simboluri SVG locale diferite și sunt afișate câte patru. Săgețile trec la grupul anterior sau următor. Indicatorul arată intervalul curent, iar butoanele sunt dezactivate la capete. Ultimul grup are trei carduri. Cardurile ascunse nu rămân în structura vizibilă sau accesibilă. Pe ecrane largi există patru coloane; pe ecrane înguste, grupul are două rânduri și două coloane.

Grupul ales se păstrează la actualizarea paginii principale și la navigare, se resetează pentru alt cont și nu este salvat în stocarea browserului. Iepurașul cu mesaje poate parcurge toate reușitele obținute, indiferent de grupul de carduri afișat.

O reușită nouă afișează o notificare temporară cu simbolul și titlul primei insigne și numărul de reușite, dacă sunt deblocate mai multe simultan. Un clinchet discret de trei note se aude o singură dată pentru fiecare notificare, independent de Anime.js și de preferința pentru mișcare redusă. În setările profilului, utilizatorul poate asculta sau dezactiva sunetul; preferința este locală pe dispozitiv și separată de datele financiare.

Sunetul pornește după o interacțiune, este anulat la navigare sau trecerea aplicației în fundal și nu reia reușitele vechi la pornire. Dacă sunetul nu este disponibil sau este blocat, confirmarea vizuală rămâne funcțională.

Notificarea apare pe orice pagină după autentificare, deasupra confirmării cheltuielii, și dispare după 4,5 secunde sau la deconectare. Cardurile vizibile ale reușitelor strălucesc scurt, simbolurile se animă, iar notificarea eliberează steluțe pastel. Reușitele existente nu repetă celebrarea la conectare, reîncărcare, schimbarea grupului sau navigare.

Efectele sunt anulate la navigare, trecerea în fundal și schimbarea preferinței de mișcare redusă. Dacă Anime.js lipsește sau nu funcționează, confirmarea text rămâne utilizabilă. Evenimentele interne identifică doar acțiunile și elementele DOM vizate. Celebrările nu modifică datele financiare sau grupul de patru carduri selectat.

## Categorii de cheltuieli

**Adaugă o categorie de cheltuială** apare sub formularul din **Adaugă o cheltuială**, în locul setărilor profilului. Categoriile personalizate sunt unice pentru fiecare cont, sunt salvate în `customCategories` și pot fi folosite la introducerea sau corectarea cheltuielilor, în legende, grafice și reușitele de categorisire. Numele sunt afișate ca text, iar fiecare cont are propriile categorii.

**Gestionează categoriile**, sub formularele de cheltuieli și categorii, deschide un dialog retro cu **Șterge** atât pentru categoriile predefinite, cât și pentru cele personalizate. Eliminarea salvează doar o listă locală în `hiddenCategories`. Numele personalizate originale și înregistrările cheltuielilor, datele, valutele și sumele rămân păstrate.

Categoriile eliminate dispar din opțiunile pentru înregistrări noi și din graficele lunilor fără cheltuieli asociate. Rapoartele istorice își păstrează numele și totalurile. La corectarea unei cheltuieli, categoria eliminată deja folosită rămâne selectată dacă nu este schimbată explicit. Detectarea automată folosește **Altele**, dacă este disponibilă, sau cere alegerea unei categorii disponibile.

**Restabilește categoriile** readuce toate opțiunile eliminate. Adăugarea unei categorii cu același nume ca una eliminată reutilizează identitatea acesteia. Ștergerea și restaurarea sunt anulate integral dacă salvarea eșuează, respectă separarea conturilor și folosesc lista de câmpuri permisă pentru sincronizarea opțională Supabase. Simpla navigare nu elimină și nu migrează categorii.

## Calendar și detalii zilnice

Cheltuielile pot fi înregistrate sau corectate numai cu o dată validă, cel târziu în ziua curentă a dispozitivului. Selectorul dezactivează zilele viitoare și lunile ulterioare, inclusiv la navigarea din tastatură. Salvarea verifică data separat și afișează o avertizare fără să golească formularul sau să modifice datele salvate.

Navigarea într-o lună viitoare păstrează data de introducere cel târziu la ziua de azi. Înregistrările existente cu dată viitoare rămân vizibile și pot fi șterse sau corectate cu o dată din trecut ori prezent; nu sunt migrate automat. Datele veniturilor rămân independente. Limita datei este recalculată la alegere și salvare.

Zilele cu cheltuieli în valuta selectată sunt verzi până la jumătate din bugetul zilnic, galbene până la bugetul zilnic și roșii peste acesta. Referința zilnică este bugetul lunar împărțit la numărul de zile din luna afișată, rotunjit la două zecimale. Fără un buget, referința implicită este de 50 de unități din valuta selectată.

Zilele fără cheltuieli păstrează fundalul pastel și nu primesc culori de cheltuire, inclusiv zilele trecute și ziua de azi. Legenda folosește **Reduse**, **Moderate** și **Ridicate**. Totalurile și nivelul cheltuielilor sunt disponibile în indicațiile zilei și etichetele accesibile. Alegerea unei zile trecute sau prezente stabilește data următoarei cheltuieli. Zilele viitoare pot fi consultate, dar adăugarea unei cheltuieli este dezactivată și este afișată o explicație.

Selectarea unei zile deschide și **Ziua ta în cifre**, cu veniturile, cheltuielile, contribuțiile la economii și diferența netă din ziua respectivă, în valuta selectată. Este afișată și starea fără înregistrări. **Adaugă o cheltuială în această zi** revine la formular cu data selectată. Consultarea detaliilor nu salvează date.

Graficul categoriilor are bare accesibile din tastatură, în nuanțe pastel violet și lila. Diagrama circulară și legenda folosesc culori pastel distincte pentru a diferenția categoriile. Alegerea unei bare arată suma, numărul înregistrărilor și ponderea în cheltuielile lunare. Corectările și schimbarea lunii sau valutei actualizează detaliile categoriei alese. Mesajul de alegere a barei și detaliile apar într-o zonă separată sub bare.

Antetul calendarului are luna și anul pe rânduri separate, butoane discrete de navigare și o linie subțire de separare. Culorile zilelor și comportamentul selectării sunt păstrate.

## Poza de profil

Poza de profil poate fi aleasă dintr-un fișier JPEG, PNG sau WebP de maximum 5 MB. Un dialog permite mutarea și mărirea imaginii înainte de confirmarea unei decupări de 256 de pixeli, salvată local pentru contul respectiv.

Poza circulară apare în dreapta sus pe toate paginile și deschide setările profilului. Fără poză, este afișată inițiala utilizatorului. Pozele nu sunt incluse în repository și nu sunt încărcate pe un serviciu extern.

La alegerea pozei, utilizatorul poate trage imaginea, folosi controalele pentru mărire și poziție sau tastele săgeată, apoi alege **Salvează poza**. Numai decuparea confirmată este codificată și salvată local; anularea păstrează poza anterioară.

## Design și animații

Apăsarea pe numele **Hopper** sau pe iepuraș, prin clic, atingere ori tastatură, revine la **Bugetul meu**, fără salvarea datelor sau pierderea formularelor în lucru. Anime.js redă și două salturi mici, o singură dată. O nouă apăsare repornește efectul fără să acumuleze animații.

Floricica de salut și iepurașul reușitelor își păstrează animațiile decorative CSS, inclusiv când Anime.js nu este disponibil. Autentificarea are opt bule de săpun pastel, translucide, cu margini irizate și reflexii albe, care plutesc lent în spatele formularului fix. Nu interceptează apăsările, se opresc când autentificarea este ascunsă sau aplicația trece în fundal și rămân nemișcate când este activată mișcarea redusă. Funcționează și fără Anime.js.

Butoanele pentru oprirea și pornirea decorului au fost eliminate, iar vechea preferință `hopper_decor_paused` este ignorată. Preferința sistemului pentru mișcare redusă are prioritate. Trecerea aplicației în fundal oprește mișcarea decorativă.

Celelalte efecte folosesc distribuția locală Anime.js: pictogramele bugetului și rândurile cheltuielilor apar succesiv, o cheltuială salvată afișează steluțe, contribuțiile la economii strălucesc, iar atingerea obiectivului eliberează particule pastel. Salvarea profilului animă scurt poza. Navigarea și trecerea în fundal anulează efectele temporare și restabilesc conținutul vizibil. Dacă biblioteca nu se încarcă, aplicația rămâne utilizabilă.

Un iepuraș pixelat separat, în dreapta antetului, vorbește printr-un balon despre reușitele obținute. Reușitele noi declanșează o celebrare scurtă, iar cele vechi pot fi parcurse prin **Altă reușită**. Fără reușite obținute, descrie următoarea etapă de economisire. Schimbarea contului actualizează mesajele, iar consultarea lor nu salvează date.

Salutul și textul introductiv original sunt păstrate. Iepurașul rămâne în interiorul antetului pe telefon și respectă mișcarea redusă și pauza din fundal. Balonul său are text puțin mai mic, spațiere mai strânsă și margini interioare reduse; mesajele complete și dimensiunea, poziția și animațiile iepurașului sunt păstrate.

Cardul de autentificare este mai îngust și compact, cu aspectul pastel și pixelat al aplicației. După cererea codului, formularul afișează adresa destinatarului, câmpul codului și confirmarea în stilul pastel al aplicației. Pe autentificare nu există raportarea problemelor sau buton pentru cont sincronizat. Controalele de sincronizare sunt ascunse în interfață, iar datele locale și integrarea opțională sunt păstrate.

Rândurile pentru gestionarea categoriilor rezervă o coloană compactă pentru **Șterge**, astfel încât numele să rămână lizibil pe telefon. Iepurașul Hopper nu mai afișează evidențierea la atingere, dar păstrează un contur vizibil pentru focalizarea din tastatură.

## Dezvoltare pentru Android și iOS

Hopper este o aplicație Android/iOS. Interfața se află în `mobile/app/` și rulează în WebView-ul nativ al aplicației instalate, prin Capacitor. Nu există un site public, o pagină cu iframe sau instalare PWA. Reîncărcarea în timpul dezvoltării folosește un server local temporar. Căile generate `/app/` sunt resurse interne.

Proiectele Capacitor **8.5.2** sunt în `android/` și `ios/`, cu modulul nativ App **8.1.2**. Identificatorul provizoriu este **ro.hopper.budget**, iar numele aplicației este **Hopper**. După publicare, identificatorul și originea stocării locale trebuie păstrate. Semnarea și încărcarea în magazine necesită acord explicit.

Folosește Node.js **22+**, apoi pregătește și verifică resursele native:

```sh
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

`npm run build` generează și verifică doar `mobile-dist/`, pornind de la `mobile/app/`. Vite construiește codul intern Capacitor; nu publică un site. Vechea structură React/TanStack și dependențele folosite exclusiv pentru web au fost eliminate. Nu există comenzi `dev`, `preview` sau de publicare a unui site. Punctul principal de intrare și `/app/index.html` din pachetul nativ păstrează căile de resurse `/app/`. Nu este inclus un manifest PWA.

`mobile/bootstrap.ts` verifică platforma nativă Capacitor înainte de încărcarea interfeței financiare. În browser apare doar instrucțiunea de a deschide aplicația instalată; scripturile conturilor și finanțelor nu rulează acolo. Scripturile obligatorii se încarcă pe rând înainte de afișarea interfeței. Lipsa resurselor opționale de sincronizare sau animație nu blochează utilizarea locală într-o sesiune autentificată. Lipsa unei resurse esențiale afișează un ecran de reîncercare. Restricția stabilește modul de acces la produs, dar nu protejează resursele locale extrase din pachet.

Pachetul nativ include JavaScript, stiluri, fontul suplimentar pentru română, Anime.js, SDK-ul Supabase, cele patru cataloage de traduceri și imaginile PNG originale ale animalelor. Nunito și Press Start 2P sunt copiate din pachete Fontsource cu versiuni fixate și licențe OFL. Resursele sunt incluse local, fără un site extern sau fonturi de pe CDN. Conectarea și validarea sesiunii la pornire necesită internet și un proiect Supabase configurat. După autentificare, operațiunile financiare locale pot fi folosite fără internet; sincronizarea necesită conexiune.

`mobile/runtime.ts` gestionează butonul Înapoi pe Android: închide dialogul prin evenimentul său de anulare, revine la buget, trece de la înregistrare la conectare, apoi minimizează aplicația din ecranul principal. Nu modifică înregistrările contului. Revenirea în prim-plan reia sincronizarea cu verificările existente. Barele sistemului urmează tema.

`mobile/native.css` gestionează spațiul pentru zonele protejate ale ecranului, dialogurile derulabile și câmpurile lizibile pe telefon. `npm run mobile:icons` pregătește iepurașul local original pe roz pastel (#FBE4EE) pentru pictogramele și ecranele de pornire Android/iOS. Pe Android, stratul adaptiv din față este transparent, are 108 dp la fiecare densitate și păstrează iepurașul în cercul central protejat. Pe iOS se folosește o pictogramă opacă de 1024 px. Schimbarea pictogramei necesită reconstruirea și actualizarea aplicației instalate; reîncărcarea interfeței în timpul dezvoltării nu actualizează pictograma de pe telefon.

### Android

Instalează Android Studio **2025.2.1+** și Android SDK **36**, corespunzător versiunii de compilare și țintă a proiectului. Configurează un JDK compatibil; compilarea din terminal folosește Java **21**. Apoi rulează:

```sh
npm run mobile:sync:android
npm run mobile:open:android
```

În Android Studio, selectează un telefon conectat sau un emulator și apasă **Run**. Comanda `npm run mobile:run:android` sincronizează și pornește aplicația pe un dispozitiv configurat. Versiunea minimă Android este API **24**, iar dialogurile necesită WebView **105+**. Pentru versiuni WebView mai vechi apare un mesaj de actualizare.

### Modificări vizibile pe emulator sau telefon

După instalarea Android Studio, SDK 36 și Java 21, pornește un emulator din **Device Manager** sau conectează un telefon Android prin USB, cu remedierea erorilor prin USB activată. Apoi rulează:

```sh
npm run mobile:live:android
```

Alege dispozitivul când apare solicitarea. Lasă terminalul deschis și salvează modificările din `mobile/app/index.html`, `styles.css`, `whimsy.css`, `script.js` sau alte fișiere din `mobile/`. Aplicația se reîncarcă după o reconstruire reușită, de obicei după o scurtă întârziere. Ultima pagină selectată este restaurată. Valorile nesalvate din formulare se pierd la reîncărcare, așa că folosește conturi de test.

Serverul implicit ascultă doar pe **127.0.0.1:5173**. Capacitor redirecționează portul prin ADB către emulator sau telefonul conectat prin USB. Nu este activată o versiune financiară accesibilă din browser. [Documentația Capacitor pentru reîncărcare în timpul dezvoltării](https://capacitorjs.com/docs/guides/live-reload).

Pentru alegerea explicită a dispozitivului sau folosirea altui port:

```sh
npm run mobile:live:android -- --target emulator-5554 --port 5174
```

Pe un Mac cu Xcode, pornește un simulator iPhone și folosește `npm run mobile:live:ios`. Pentru un iPhone fizic sau un Android conectat prin rețeaua locală, dispozitivul și calculatorul trebuie să fie pe aceeași rețea Wi-Fi. Specifică explicit adresa IPv4 privată a calculatorului, de exemplu `npm run mobile:live:ios -- --host 192.168.1.20`. Serverul ascultă pe acea adresă; poate fi necesară permiterea conexiunii în paravanul de protecție local. Folosește adresa actuală a calculatorului. Adresele publice și `0.0.0.0` sunt respinse. Permisiunile iOS pentru HTTP și rețea locală sunt temporare și sunt eliminate la oprirea sesiunii.

Reîncărcarea folosește o **origine separată de dezvoltare**, implicit `http://127.0.0.1:5173`, astfel încât datele conturilor de test sunt separate de stocarea aplicației native obișnuite. Înregistrările native existente nu sunt șterse sau migrate și reapar la folosirea aplicației împachetate normal. Schimbarea adresei sau portului creează un alt spațiu de stocare pentru dezvoltare. Folosește conturi și un proiect Supabase de test pentru sincronizarea în timpul dezvoltării. Identificatorul aplicației și adresa ori schemele de stocare din producție rămân neschimbate.

Apasă **Ctrl+C** sau rulează `npm run mobile:live:stop` într-un alt terminal pentru oprirea serverului și restaurarea configurației native generate. Comanda se autentifică pentru sesiunea locală; tokenul ei nu este distribuit cu resursele aplicației. Oprește sesiunea înainte de compilarea unui APK/AAB sau de folosirea comenzilor `mobile:sync:*`. Compilările pachetelor sunt blocate cât timp există marcajul sesiunii active.

După închiderea forțată a terminalului sau procesului, recuperează configurația cu:

```sh
npm run mobile:live:restore
```

Recuperarea nu suprascrie o sesiune care încă rulează. Înregistrările financiare locale nu fac parte din fișierele de restaurare. O compilare invalidă păstrează pachetul complet anterior. Salvările rapide sunt grupate, iar reconstruirile rulează pe rând.

Compilările de dezvoltare folosesc directoarele ignorate `.mobile-live/a` și `.mobile-live/b`, iar pachetul servit este schimbat doar după reușită. Scriptul de reîncărcare este adăugat numai acolo. Resursele pentru magazine sau APK din `mobile-dist/` păstrează un singur script nativ, fără scriptul de reîncărcare sau adresa serverului local. Gradle respinge și o versiune de distribuție care conține o adresă de server de dezvoltare.

Repornește sesiunea după modificarea dependențelor, a `.env.local`, a configurației Capacitor sau a codului nativ Java/Swift/Gradle. Aceste modificări necesită sincronizarea resurselor sau o nouă compilare nativă; reîncărcarea automată acoperă interfața din `mobile/`. Opțiunea `--server-only` permite verificarea serverului local și a monitorizării fișierelor fără SDK; nu compilează, nu instalează și nu deschide aplicația financiară în browser.

### Distribuire Android: Google Play și fișier APK

Aceeași aplicație poate fi distribuită prin Google Play și printr-un APK descărcabil direct. Google Play primește un pachet **Android App Bundle (.aab)** semnat. Instalarea directă folosește un fișier **.apk** semnat. Un AAB nu poate fi instalat direct pe telefon. Pachetele de distribuție necesită instrumentele Android și o cheie de semnare configurată.

Instalează Java **21** și platforma SDK **36**, cu instrumentele de compilare. JDK-ul inclus în Android Studio poate fi folosit dacă este versiunea compatibilă. Setează `JAVA_HOME` la directorul JDK și `ANDROID_HOME` la directorul SDK sau lasă Android Studio să creeze `android/local.properties`. Scriptul verifică și căile obișnuite ale JDK-ului Android Studio pe Windows. Licențele SDK trebuie acceptate de dezvoltator.

Înaintea unei versiuni de distribuție, creează sau selectează propriul fișier de chei în dialogul Android Studio **Build → Generate Signed Bundle / APK**. Păstrează o copie sigură a cheii și parolelor. Copiază `android/signing.properties.example` în `android/signing.properties` și completează căile și datele de acces **local**, fără să le trimiți în chat sau să le incluzi în Git. Căile cheilor folosesc bare oblice normale pe Windows. Configurația privată și pachetele generate sunt ignorate de Git.

Profilul `app*` semnează APK-urile distribuite direct. Profilul opțional `upload*` semnează AAB-urile pentru Play; dacă toate câmpurile acestuia lipsesc, se folosește cheia aplicației. O configurație incompletă este respinsă.

Variabilele private de mediu echivalente sunt `HOPPER_APP_STORE_FILE`, `HOPPER_APP_STORE_PASSWORD`, `HOPPER_APP_KEY_ALIAS`, `HOPPER_APP_KEY_PASSWORD` și cele patru nume corespunzătoare `HOPPER_UPLOAD_*`. Cheile lipsă sau valorile demonstrative opresc compilarea versiunii de distribuție. Versiunile de depanare folosesc semnătura Android de dezvoltare și sunt destinate doar testării.

```sh
# APK semnat pentru instalare directă
npm run android:apk

# AAB semnat pentru încărcare în Google Play
npm run android:aab

# Generează ambele formate de distribuție
npm run android:release

# APK de test; nu este destinat publicării în Google Play sau distribuirii publice
npm run android:apk:debug
```

Fiecare comandă actualizează și verifică resursele locale, sincronizează proiectul Android și rulează Gradle prin scriptul proiectului. Pachetele reușite sunt copiate în `artifacts/android/hopper-1.0-v1.apk` sau `artifacts/android/hopper-1.0-v1.aab`, împreună cu fișiere pentru verificarea SHA-256. APK-ul de test are sufixul `-debug`. Fișierele temporare de compilare și descărcare se află în `.android-build/gradle/`.

O compilare eșuată nu exportă un pachet nou, iar pachetele vechi nu sunt suprascrise până la reușită. Verifică mesajul de confirmare și data fișierului înainte de distribuire.

Actualizează `android/version.properties` înaintea fiecărei versiuni publicate: mărește `versionCode` și actualizează `versionName`. Ambele formate folosesc același identificator și aceeași versiune. **ro.hopper.budget** este încă provizoriu și trebuie confirmat înainte de prima încărcare în magazin.

Pentru trecerea între APK și actualizările Play fără dezinstalare, certificatul de semnare al APK-ului trebuie să coincidă cu **certificatul de semnare al aplicației din Google Play**. Configurează Play App Signing cu propria cheie de semnare a aplicației la prima publicare. Cheia de încărcare poate fi diferită; simpla potrivire a acesteia nu face instalările compatibile. [Documentația Android pentru semnarea aplicațiilor](https://developer.android.com/studio/publish/app-signing).

Încarcă mai întâi AAB-ul într-o etapă de testare internă. Completează prezentarea aplicației, politica de confidențialitate, declarațiile despre date și conturi și cerințele de testare afișate în Play Console înainte de verificarea pentru producție. Compilarea unui AAB nu creează automat o aplicație descărcabilă în magazin.

APK-ul poate fi distribuit ca fișier sau printr-o adresă HTTPS de descărcare, fără o versiune web Hopper. Utilizatorul trebuie să permită instalarea din sursa aleasă pe Android. Comenzile de compilare nu publică și nu încarcă nimic; semnarea și distribuirea efectivă necesită acord explicit.

### iOS

Folosește un Mac cu Xcode **26+** și Xcode Command Line Tools:

```sh
npm install
npm run mobile:sync:ios
npm run mobile:open:ios
```

Proiectul folosește Swift Package Manager și este destinat iOS **15.4+**. Selectează echipa în **Signing & Capabilities**, apoi pornește pe un iPhone sau simulator. Comanda `npm run mobile:run:ios` este disponibilă pe un Mac configurat. TestFlight și App Store Connect necesită arhive semnate.

Repository-ul conține proiectele de dezvoltare, nu o versiune publicată în magazine. Mediul Windows a fost configurat pentru compilări Android de test, iar APK-ul de depanare a fost compilat și instalat pe telefon în verificările anterioare. Compilarea iOS necesită un Mac. Contul Google Play există; pentru App Store este necesar și un cont Apple Developer.

Testarea pe dispozitive trebuie să acopere tastatura și dialogurile, zonele protejate ale ecranului, selectarea pozelor, redeschiderea cu verificarea online a sesiunii, păstrarea datelor când internetul lipsește, copiile locale și sincronizarea. Pregătirea resurselor și testele JavaScript nu înlocuiesc aceste verificări native.

Cerințe oficiale: [pregătirea mediului Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup), [publicarea în Google Play](https://capacitorjs.com/docs/android/deploying-to-google-play), [publicarea în App Store](https://capacitorjs.com/docs/ios/deploying-to-app-store).

### Date și actualizări ale aplicației

Rulează din nou `mobile:sync:android` sau `mobile:sync:ios` după modificarea interfeței sau a `.env.local`. Aplicațiile instalate primesc modificările printr-un pachet nativ recompilat. Nu este configurat un `server.url` extern, iar conținutul HTTP mixt este dezactivat. Setările publice Supabase sunt generate înainte de împachetare; cheile secrete și fișierele de semnare nu sunt incluse.

WebView-ul nativ păstrează `expenses_users`, `expenses_current_user`, sumele și valutele originale, limba dispozitivului și pozele de profil locale. Adresa **localhost**, schema Android **https** și schema iOS **capacitor** rămân neschimbate, păstrând originea stocării native. Eliminarea surselor web vechi nu șterge datele locale de pe dispozitive.

Datele introduse anterior în Chrome sau Safari rămân în stocarea browserului și nu sunt transferate automat în aplicația nativă. Nu a fost implementată o migrare din browser. Înregistrările deja sincronizate pot fi descărcate prin conectarea aceluiași cont online, după configurarea Supabase. Pozele rămân pe dispozitivul original.

Dezinstalarea sau ștergerea datelor aplicației poate elimina înregistrările locale. O copie online necesită un cont sincronizat configurat.

## Alegerea limbii

Selectorul de limbă folosește același buton retro și dialog pastel ca anul de studiu și calendarul. Marchează limba aleasă, permite navigarea cu săgețile și tastele Home/End, se închide cu Escape și readuce focalizarea la selector. Același dialog este disponibil la autentificare și în setări. Dacă dialogurile sau JavaScript nu sunt disponibile, rămân selectoarele native.

Selectorul apare la autentificare și în **Profil și setări**. Cheia `hopper_language` memorează preferința dispozitivului independent de conturi; româna este limba implicită.

Etichetele, avertizările formularelor, reușitele, textele accesibile și mesajele dinamice au traduceri locale în `mobile/app/translations.js`. Datele calendarului și sumele sunt formatate după limba aleasă. Numele, descrierile, categoriile personalizate, valutele tranzacțiilor și sumele salvate nu sunt traduse sau convertite.

Valorile interne ale opțiunilor pentru sursa veniturilor rămân aceleași, chiar dacă etichetele sunt traduse. Valuta de afișare este și ea o preferință locală, astfel încât o schimbare externă nu poate modifica valuta unui formular nesalvat.

## Sincronizare opțională prin Supabase

Controalele de sincronizare sunt ascunse la cererea utilizatorului. Integrarea și migrarea opționale existente sunt păstrate pentru compatibilitatea conturilor și datelor, iar autentificarea online prin cod pe email este obligatorie. Aceasta nu activează încărcarea datelor financiare.

Înregistrările locale existente, pozele și cheile de stocare sunt păstrate. Raportarea problemelor folosește o funcție Supabase separată și nu necesită sincronizarea financiară.

## Structura surselor și verificări

- `mobile/app/`: autentificarea prin cod pe email, interfața financiară, stocarea locală, traducerile, animațiile, sincronizarea și imaginile originale ale animalelor.
- `mobile/assets/animals/`: informații despre imaginile PNG locale păstrate.
- `mobile/`: pornirea nativă, structura interfeței împachetate, comportamentul aplicației și stilurile pentru zonele protejate ale ecranului.
- `android/` și `ios/`: proiectele native.
- `tests/`: teste pentru operațiuni financiare, compatibilitate, animații, limbi, sincronizare, pornire și navigare nativă.
- `scripts/`: sincronizarea resurselor locale, pregătirea și verificarea pachetelor native, pictogramele și generarea fontului românesc.

`npm run build` include `mobile:check`. Verifică ambele puncte interne de intrare, resursele și fonturile locale, copierea neschimbată a scripturilor financiare, pornirea exclusiv nativă și absența manifestului de instalare din browser.

`npm test` verifică compatibilitatea conturilor salvate, blocarea pornirii financiare în browser, erorile vizibile pentru resurse esențiale lipsă, funcționarea fără resurse opționale și ordinea încărcării scripturilor. Versiunea impusă `uuid` **11.1.1** este păstrată pentru dependența instrumentelor native și Xcode.

## Raportarea problemelor

**Raportează o problemă** este disponibil numai în **Profil și setări**. Dialogul retro acceptă un rezumat, o descriere și maximum trei poze sau clipuri selectate explicit: 20 MB în total, maximum 5 MB pentru o imagine și 15 MB pentru un clip.

Fișierele pot fi previzualizate și eliminate. Formularele care nu au putut fi trimise sunt păstrate pentru reîncercare. Rapoartele includ doar textele introduse, dovezile alese și versiunea aplicației disponibilă. Nu citesc automat înregistrările contului sau poza de profil.

Aplicația trimite datele și fișierele către o funcție Supabase Edge Function. Stocarea privată Supabase și Resend livrează dovezile către destinatarul configurat pe server. Adresa destinatarului, o legătură mailto, cheia Resend și cheia cu privilegii de server nu sunt incluse în aplicație.

Confirmarea apare numai după acceptarea raportului de către server pentru trimiterea prin email; livrarea efectivă depinde și de furnizor. Nu este necesară o aplicație de email sau extensia App Launcher.

**Serviciul de raportare trebuie încă activat.** Consultă [ghidul de configurare în română](supabase/README.md), migrarea pentru raportare privată `supabase/migrations/202610060001_hopper_problem_reports.sql` și exemplul de configurare publică `.env.reports.example`.

Fără configurare, dialogul anunță că trimiterea nu este disponibilă și nu afișează o confirmare falsă. Publicarea funcției, rularea SQL și livrarea reală a emailurilor nu au fost efectuate. Testele locale simulează trimiterea; nu au fost încărcate rapoarte sau dovezi reale.

Serverul verifică limitele și semnăturile fișierelor, limitează dimensiunea cererilor și frecvența lor, ascunde erorile furnizorului și folosește un identificator stabil al raportului și același conținut de email pentru reîncercări sigure. Dovezile sunt private și sunt accesibile furnizorului de email prin legături temporare semnate.

Nu există încă o sarcină automată de ștergere a dovezilor. Administratorul trebuie să configureze perioada de păstrare și monitorizarea rapoartelor eșuate înainte de publicarea pentru utilizatori.

## GitHub: commit și push manual

Proiectul este publicat în [anaprepelita/hopper](https://github.com/anaprepelita/hopper). Destinația Git `student` este folosită pentru Hopper; `origin` păstrează legătura veche. Commiturile folosesc adresa GitHub noreply a contului `anaprepelita`.

Commiturile și push-urile sunt manuale. Tu alegi ce modificări incluzi, mesajul commitului și momentul în care trimiți codul pe GitHub. Salvarea unui fișier în VS Code nu trimite nimic.

Deschide terminalul în proiect și verifică modificările:

```powershell
git status
git diff
```

Pregătește modificările pe care vrei să le incluzi. `git add .` include toate schimbările neignorate; poți folosi în schimb `git add numele-fisierului` pentru fișiere alese.

```powershell
git add .
```

Opțional, verifică fișierele pregătite pentru chei private și exporturi de conturi, apoi consultă exact conținutul pregătit:

```powershell
npm.cmd run github:check
git diff --cached
```

Comanda `github:check` doar citește fișierele pregătite. Nu adaugă fișiere, nu creează commituri și nu face push. Configurația privată, cheile de semnare, pozele de profil, pachetele compilate și instalarea Android Studio rămân excluse prin `.gitignore`. Verificarea este suplimentară și nu înlocuiește citirea modificărilor.

Creează commitul cu un mesaj care descrie schimbarea și trimite-l:

```powershell
git commit -m "Descrie aici ce ai modificat"
git push student main
```

De exemplu, mesajul poate fi `Corectez validarea sumei la cheltuieli`. Prima comandă salvează versiunea local; a doua o trimite pe GitHub. Dacă nu sunt schimbări, nu este necesar un commit nou. Testele și verificările proiectului pot fi rulate înainte de commit cu comenzile din secțiunea de dezvoltare.

Jurnalul zilnic [CHANGELOG.md](CHANGELOG.md) rămâne în proiect. Descriem în română ce am adăugat, modificat sau corectat, sub data zilei din România, păstrând însemnările anterioare. Când modifici singură proiectul, completează și jurnalul înainte de commit. Include-l împreună cu schimbările pe care le trimiți.

Publicarea în Google Play sau App Store rămâne separată de trimiterea codului pe GitHub.
