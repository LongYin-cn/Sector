# Promuovere Sector

Piano e link controllati il 20 ottobre 2026. Questo documento prepara il lancio:
non è un annuncio che la versione 1.0.0 sia già pubblicata.

## Da dove partire

| Priorità | Dove | Cosa proporre |
| --- | --- | --- |
| 1 | [Forum ufficiale: Third Party Software, Plugins and Tools](https://community.lemansultimate.com/index.php?forums/third-party-software-plugins-and-tools.29/=) | Un thread dedicato con video, installazione, requisiti, limiti e changelog. È la sezione dedicata agli strumenti della community. |
| 2 | [Discord ufficiale LMU](https://discord.com/invite/7tEDVveeBC) | Chiedere allo staff dove presentare un'app indipendente con overlay e reset per Practice offline. Usare il canale indicato, una sola presentazione. |
| 3 | [r/LeMansUltimateWEC](https://www.reddit.com/r/LeMansUltimateWEC/) | Presentazione personale e clip reale, con flair “Apps / addons / plugins”, soltanto rispettando le regole attuali e le indicazioni dei moderatori. |
| 4 | [r/simracing](https://www.reddit.com/r/simracing/) | Dimostrazione del problema risolto: ripetere una curva e vedere i dati utili durante la guida. Chiarire subito che l'app è per LMU. |

Il sito LMU collega direttamente forum e Discord nella sua
[pagina Community](https://lemansultimate.com/community/). Non ho accesso ai
canali interni del server: il nome del canale promozionale va verificato dopo
l'ingresso, senza dare per scontato che `community-support` sia quello corretto.

### Regole da considerare

Le [regole pubbliche di r/LeMansUltimateWEC](https://www.reddit.com/r/LeMansUltimateWEC/)
vietano l'autopromozione eccessiva, richiedono il flair e vietano post e immagini
generati con AI. **Non incollare lì i testi generati in questo documento.**
Scrivi personalmente il post; usa riprese reali del gioco e dell'app, senza
presentare il logo generato come contenuto ammesso dai moderatori. Il subreddit
ha anche restrizioni sulla discussione di reverse engineering di contenuti
cifrati: descrivi con trasparenza il funzionamento del progetto e chiedi ai
moderatori se un annuncio di questo strumento è accettabile.

[r/simracing](https://www.reddit.com/r/simracing/) ammette autopromozione moderata
dei prodotti, ma vieta contenuti relativi a cheating e hacking. Spiega che
Active Reset è limitato alla Practice offline e si disabilita con EAC.
Chiedere prima ai moderatori evita ambiguità sul tipo di strumento. Non promettere
compatibilità o approvazione da Studio 397. Queste regole possono cambiare.

## Prima dell'annuncio

1. Pubblicare una release scaricabile e verificata. Per annunciare “1.0.0” deve
   esistere il relativo tag e il pacchetto Windows deve partire su un altro PC.
2. Registrare una clip reale di 20-30 secondi: F6, una curva, F7, stessa curva
   ripetuta; mostrare anche Inputs, Delta e Leaderboard.
3. Preparare una schermata della Home e una dell'editor con slider e colonne.
4. Elencare i limiti della build pubblicata. Non annunciare riaggancio ruote,
   riparazione di ogni danno o risoluzione delle penalità prima dei test in LMU.
5. Usare un solo link principale: [release GitHub](https://github.com/sector-lmu/Sector/releases).
   Il [repository](https://github.com/sector-lmu/Sector) contiene codice,
   installazione e immagini; le [issue](https://github.com/sector-lmu/Sector/issues)
   raccolgono i problemi.

Per iniziare sceglierei forum e Discord, poi Reddit dopo il primo feedback.
Rispondi alle domande nello stesso thread. Torna a pubblicare solo per novità
sostanziali, non per ogni correzione minore.

## Messaggio allo staff Discord o ai moderatori

Bozza in inglese, da usare dove consentito:

> Hi! I develop Sector, a free, open-source Windows companion for Le Mans
> Ultimate. It combines customizable telemetry overlays with an experimental
> checkpoint reset for offline Practice. Reset requires LMU to be launched
> without EAC and is disabled when EAC is detected; it is not an online reset tool.
>
> Would a short project introduction and a real gameplay clip be appropriate
> here? Which channel or section should I use?
>
> Source and documentation: https://github.com/sector-lmu/Sector

## Presentazione breve per Discord

Da usare nel canale autorizzato, dopo aver pubblicato la release:

> Hi everyone, I'm the developer of Sector, a free, open-source companion for
> Le Mans Ultimate on Windows.
>
> It brings together customizable overlays and Active Reset for practicing
> a corner or section. Save a checkpoint with F6 and return to it with F7;
> both shortcuts can be changed.
>
> The overlay editor lets you move and resize widgets, adjust opacity, choose
> columns and configure inputs. Active Reset requires offline Practice without
> EAC. The app blocks reset when EAC is detected.
>
> Active Reset is experimental. Please check the release notes for supported
> cases and known limitations.
>
> Download and instructions: https://github.com/sector-lmu/Sector/releases
>
> I'd appreciate feedback on the UI and widget layout. For bugs, Sector has
> Help > Report a bug and Help > Export diagnostics.

Allega la clip. Evita tag collettivi, messaggi privati non richiesti e link
Ko-fi nel primo messaggio, salvo esplicita ammissione delle regole del server.

## Thread per il forum ufficiale

Titolo proposto: **Sector: customizable LMU overlays and offline practice checkpoints**

> I'm developing Sector, a free, open-source Windows app for Le Mans Ultimate.
>
> I wanted a way to repeat a corner during offline practice and arrange the
> information I use while driving in one companion app.
>
> Sector includes ten configurable widgets: Leaderboard, Relative, Weather,
> Delta, Inputs, Laps, Session, Tyres, Stint planner and Hybrid. You can adjust
> their position, size, opacity and available columns.
>
> Active Reset saves a checkpoint and restores the saved driving state.
> Default keys are F6 and F7. This feature is experimental and only available
> in offline Practice with EAC disabled. It is blocked when EAC is detected.
>
> Installation: download the Windows ZIP, extract the entire folder, run
> Sector.exe and confirm your LMU installation. No Python or Node.js setup is needed.
>
> Downloads and known limitations: https://github.com/sector-lmu/Sector/releases
>
> Source and guide: https://github.com/sector-lmu/Sector
>
> Feedback and bug reports are welcome. Please include your app version, car,
> track and reproduction steps. Diagnostic exports are available from Help.
>
> Sector is an independent community project, not an official LMU product.

Mantieni il primo messaggio aggiornato con l'ultima release verificata.
Le condizioni degli overlay online vanno descritte in base alle prove reali
della build, senza promettere dati che il gioco non espone.

## Reddit: cosa raccontare personalmente

Per r/LeMansUltimateWEC scrivi tu, senza copiare queste bozze:

- Perché hai iniziato il progetto e quale problema hai incontrato nella pratica.
- Una prova concreta con auto e circuito, accompagnata da una clip registrata.
- La differenza fra overlay e reset offline.
- Prezzo gratuito, codice aperto e link alla release.
- Limiti attuali e una domanda specifica sul feedback che ti serve.

Per r/simracing il contesto deve essere comprensibile anche a chi non usa LMU.
Una clip che mostra il funzionamento comunica più di un lungo elenco di widget.
Non presentarti come utente indipendente che ha “scoperto” l'app: dichiarati autore.

## Piccolo piano di lancio

| Momento | Azione |
| --- | --- |
| Prima del lancio | Test su un secondo PC, clip, release notes, richiesta ai moderatori |
| Giorno della release | Thread sul forum e annuncio nel canale Discord autorizzato |
| Nei giorni successivi | Risposte, raccolta bug e post Reddit se consentito |
| Dopo una settimana | Correzioni e aggiornamento del thread con risultati concreti |

Misura download delle release, problemi riproducibili e feedback di chi usa
l'app. Le stelle GitHub sono utili, ma non dimostrano che gli utenti la stiano usando.
Il [Ko-fi](https://ko-fi.com/illandiii) può restare nel repository come sostegno
volontario, senza diventare il motivo principale dell'annuncio.
