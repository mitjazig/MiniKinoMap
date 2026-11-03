# RUNSCAPE

Mini Kinomap za tekalno stezo. Izbereš traso, povežeš pas ali simulator, video pa se premika glede na pretečeno razdaljo. Prva verzija nima računa, strežnika ali plačila. Treningi ostanejo v brskalniku (IndexedDB).

Tekalna steza je za uporabniški vmesnik in workout engine samo `TreadmillTransport`. Danes sta na voljo simulator in standardni Bluetooth FTMS. **Kettler Alpha Run 200 ni predpostavljen kot FTMS.** Proprietary protokola ni v kodi. Ko bo GATT posnetek z naprave, se doda `KettlerAlphaRun200Transport` oziroma adapter poleg FTMS.

## INSTALL

```bash
npm install
```

Preizkušeno z Node.js 18. Na Windowsu je med odvisnostmi tudi `@tailwindcss/oxide-win32-x64-msvc`, ker Tailwind 4 potrebuje ta binarni paket.

## RUN

```bash
npm run dev
```

Odpri naslov, ki ga izpiše Vite (običajno `http://localhost:5173`). Simulator se ob zagonu poveže sam.

## BUILD

```bash
npm run build
npm run test
npm run lint
```

`npm run build` najprej požene TypeScript (`tsc --noEmit`), nato PWA build. Servisni worker pokrije ovoj aplikacije. Velikih videov ne shranjuje za offline.

## SIMULATOR TESTING

Simulator je glavni način razvoja, dokler tekalne steze ni zraven.

1. Zaženi `npm run dev`.
2. Na začetnem zaslonu je značka **SIMULATOR**. Vir je Simulator in stanje Connected.
3. Odpri **Choose route** in izberi traso. Odpre se zaslon treninga.
4. Pritisni **Start**.
5. Odpri **Simulator controls** (ali pojdi na `/debug`).
6. Nastavi hitrost: drsnik, `+` / `−` po 0,1 km/h, ali Walk 4 / Jog 7 / Run 10 / Sprint 15.
7. Razdalja, čas, tempo in video predogled se premikajo samo med tekom. Pavza ustavi čas.
8. **Stop** vpraša za potrditev in shrani trening v History.

Koristne nastavitve v simulatorju:

- Incline 0–12 % z lastnim drsnikom. Sprememba je počasna, pas ne skoči.
- Heart rate: Auto sledi hitrosti in naklonu, Manual je 60–200 bpm.
- Scenariji: Manual, Easy run (5 min 6 km/h, 10 min 8 km/h, 5 min 6 km/h), Intervals (2 min 6 / 1 min 12, ponavlja), Hills (naklon 0–10 %), Random.
- Hitrost simulacije x1 / x2 / x5. Čas treninga teče v simuliranem času, da lahko daljši tek preizkusiš hitreje.
- Pause belt, Reset, Simulate disconnect.
- Packet corruption in Sensor dropout: off / occasional. Pokvarjen paket se zavrže, aplikacija ne pade.
- Na `/debug` vidiš HEX, kot da bi prišel iz FTMS karakteristike `0x2ACD`, razčlenjene vrednosti in dnevnik.

Simulate disconnect med tekom:

- video se ustavi,
- pasica pravi **Treadmill connection lost**,
- trening ostane v `connectionLost`, podatki do takrat ostanejo,
- Reconnect vrne simulator in trening v pavzo. Nadaljuješ z Resume.

Brez datoteke MP4 se namesto videa vrti narisani predogled, sinhroniziran z razdaljo. Pravi posnetek položiš v:

- `public/videos/lakeside.mp4`
- `public/videos/pine.mp4`
- `public/videos/quarry.mp4`

Predogled ni iz Kinomapa. Video se ne predvaja 1:1 s km/h. `RouteProgressEngine` računa ciljni čas iz pretečene razdalje in trajanje posnetka (referenca 10 km/h). Majhen zamik popravi `playbackRate` (0,5–2). Velik zamik naredi seek. Stoječ pas video ustavi.

Auto incline je privzeto vklopljen v Settings. Na simulatorju deluje, razen ko scenarij Hills ali Random sam vodi naklon. Ukaz je omejen z max incline in se spreminja postopoma.

## BLUETOOTH TESTING

Web Bluetooth deluje samo v varnem kontekstu: `https://` ali `http://localhost`. Potreben je Chromium (Chrome, Edge, nekatere WebView na Androidu). Firefox in Safari Web Bluetootha nimata. Če API manjka, Device zaslon to pove in simulator ostane uporaben.

Povezava je v `src/treadmill/bluetooth/WebBluetoothTransport.ts`. UI kliče samo `connect()` / `disconnect()` na vmesniku.

Ob povezavi aplikacija:

1. odpre sistemski izbirnik (`acceptAllDevices`, da se pokaže tudi naprava brez FTMS oglasa),
2. zahteva znane fitnes servise v `optionalServices`,
3. zgradi GATT poročilo (samo servisi, ki jih je brskalnik smel videti),
4. če najde Fitness Machine `0x1826` in Treadmill Data `0x2ACD`, vklopi notificatione in jih da v `FtmsTreadmillParser`,
5. ukaze za hitrost, naklon, start in stop pošlje **samo** če obstaja FTMS Control Point `0x2AD9`, če podpira indikacije in če naprava potrdi `Request Control`.

Če česa od tega ni, je rezultat **Control unsupported**. Neznanih Kettler ukazov aplikacija ne pošilja.

Če servisa `0x1826` ni:

> FTMS service was not detected. This treadmill may use a proprietary Kettler protocol. Use BLE Inspector and export the detected GATT structure.

Web Bluetooth ne more našteti neznanih servisov, če njihovi UUID-ji niso bili navedeni pred `requestDevice()`. To je izpisano v dnevniku in v GATT poročilu, aplikacija se ne sesuje.

## HOW TO TEST WITH KETTLER

1. Vklopi Alpha Run 200.
2. Vklopi APP mode (po navodilih Kettlerja, da pas oglašuje Bluetooth).
3. Telefon ali tablico (Chrome) odpri na `https` ali na `localhost`.
4. Odpri **Connect treadmill**.
5. Pritisni **Connect treadmill** in v sistemskem oknu izberi pas.
6. Odpri `/debug`.
7. Pritisni **Copy / Export GATT report** in **Export debug report**.
8. Če FTMS teče, naj se v Live data in Raw data pojavijo paketi, ko pas teče. Aplikacije ne uporabljaj za pošiljanje naklona, dokler v dnevniku ni `Control granted`.

Če se chooser odpre in naprave ni na seznamu, pas verjetno ne oglašuje (napačen način, že povezan z drugim telefonom, ali Bluetooth izklopljen).

## WHAT TO SEND BACK AFTER FIRST KETTLER TEST

Po prvem poskusu shrani in pošlji:

- GATT report (JSON z gumba Copy / Export GATT report)
- ime naprave
- seznam servisov
- seznam karakteristik in lastnosti: read, write, writeWithoutResponse, notify, indicate
- surove HEX notificatione z `/debug` (tudi če parser javi napako)
- dnevnik dogodkov (Export debug report)
- posnetek zaslona Device in Debug
- ali se je pas pojavil v chooserju in ali je FTMS `0x1826` sploh bil najden

To je vhod za morebitni `KettlerAlphaRun200` adapter. Dokler tega ni, se proprietary protokol ne ugiba.

## Arhitektura

```
UI  →  WorkoutEngine  →  TreadmillTransport
                              ├── SimulatorTransport
                              └── WebBluetoothTransport
                                      ├── FtmsProtocolAdapter
                                      └── (kasneje) Kettler adapter
```

`WorkoutEngine` in zasloni ne preverjajo, kateri gonilnik je aktiven. Simulatorjev panel sme govoriti neposredno s `SimulatorTransport`, ker je to razvojno orodje.

Stanje treninga: `idle` → `ready` → `running` ↔ `paused` → `finished`, ter `connectionLost` iz tekočega ali pavziranega teka. Po ponovni povezavi je trening v pavzi. Start med aktivnim tekom ni mogoč. Pavza ni mogoča, če tek ne teče. Čas treninga je samo aktivni čas. Povprečna hitrost je razdalja / aktivni čas.

## Demo trase

| Trasa | Razdalja | Značaj |
| --- | --- | --- |
| Lakeside Path | 5 km | skoraj ravno |
| Pine Switchbacks | 8 km | valovito |
| Quarry Ridge | 10 km | klanec, en odsek približno 10 % |

## GARMIN / HEART RATE TESTING

Aplikacija ne uporablja Garminovega lastnega protokola. Ura se poveže samo kot standardni Bluetooth LE Heart Rate senzor (storitev `0x180D`, meritev `0x2A37`).

1. Na Garmin uri vklopi **Broadcast Heart Rate**.
2. Odpri **Devices**.
3. Pritisni **Connect HR sensor**.
4. Izberi Garmin oziroma drugo napravo, ki oglašuje Heart Rate Service.
5. Preveri BPM na zaslonu naprave in na treningu. Pod številko je ime vira.
6. Na `/debug` preveri zadnji paket, razčlenjen BPM, RR intervale in **Copy HR debug report**.

Browser in Garmin firmware lahko vplivata na to, ali je ura neposredno vidna kot BLE Heart Rate naprava. Če ure ni na seznamu ali storitve `0x180D` ni, aplikacija to pove. Uporabi **Use HR simulator** in shrani debug poročilo. **Inspect a device** odpre izbirnik brez filtra, da se vidi, ali ura sploh nima standardne storitve.

Če senzor med tekom pade, trening in tekalna steza tečeta naprej. Prikazana je samo pasica **Heart rate sensor disconnected** in gumb za ponovno povezavo.

Prioriteta utripa, brez povprečenja:

1. zunanji BLE senzor, če je povezan
2. sicer utrip s tekalne steze
3. sicer simulator, če je vklopljen

V Settings je izbira Auto / External BLE / Treadmill / Simulator.

## CHROMECAST TESTING

Telefon ostane kontroler. Televizor predvaja video trase prek standardnega Google Cast izbirnika. Lastnega Cast receiverja ni. Kako bi se kasneje dodal overlay, je v `docs/CUSTOM_CAST_RECEIVER.md`.

1. Telefon in Chromecast naj bosta na istem Wi-Fi.
2. Odpri aplikacijo v Chromu.
3. Izberi traso, katere video URL je dosegljiv po omrežju, ali v Settings vpiši javni testni MP4.
4. Pritisni **Cast**.
5. Izberi Chromecast.
6. Zaženi trening. Na telefonu ostanejo hitrost, tempo, razdalja, utrip in naklon. TV predvaja video.

Chromecast ne more predvajati localhost, blob ali datoteke, ki obstaja samo v brskalniku. Demo trase imajo `castCompatible: false`, ker kažejo na `/videos/...`. Če URL ni dosegljiv, se prikaže obvestilo, da Chromecast potrebuje omrežno dosegljiv media URL.

Za razvoj v Settings nastavi **Test video URL for Chromecast** na javni `https://` MP4. Ta URL se uporabi namesto lokalne datoteke.

Če TV med tekom pade, se trening ne prekine. Video se vrne na telefon na istem času, dialog pa ponudi **Continue on phone**.

Če Cast v brskalniku ni na voljo, aplikacija pove, da Google Cast ni na voljo.

## YOUTUBE SCENIC MODE

YouTube video je samo slika hoje. Predvaja se prek uradnega IFrame Player API. Aplikacija videa ne prenese in ga ne pretvori v MP4. Hitrost, naklon, utrip in statistika tečejo neodvisno od časa v videu.

YouTube video availability, embedding permissions, ads and player behavior are controlled by YouTube.

Kako dodati video:

1. Odpri Routes.
2. Add YouTube Route.
3. Prilepi YouTube URL.
4. Izberi Scenic.
5. Shrani.
6. Izberi workout.
7. Start Walk.

Podprti naslovi: `watch?v=`, `youtu.be`, `embed` in `shorts`. V predvajalnik gre samo preverjen video id, ne surov HTML.

Metrike so pod predvajalnikom. Lastnih gumbov in številk čez YouTube iframe ni. Če video ni vgradljiv, se prikaže: "This YouTube video cannot be embedded. Please choose another video."

## YOUTUBE DISTANCE SYNC

Če poznamo približno razdaljo prikazane poti, lahko route mapira pretečeno razdaljo na video timeline. To ni nujno geografsko popolnoma natančno.

Pri shranjevanju izberi Distance synced in vpiši razdaljo v kilometrih ter začetek in konec videa v sekundah. Napredek je `distance / totalDistance`. Ciljni čas je `videoStart + progress * (videoEnd - videoStart)`.

Zamik pod 3 s se ne popravlja. Med 3 in 8 s se hitrost predvajanja spremeni samo, če jo player dejansko podpira. Nad 8 s se video prestavi. To je bolj konservativno kot pri lokalnem MP4.

Nastavitev **Pause YouTube when treadmill stops** je privzeto vklopljena. Pod 0,3 km/h več kot dve sekundi video ustavi. Ko hoja nadaljuje, se predvajanje vrne.

Cast na YouTube trasi ne uporablja MP4 predvajalnika. Pokaže se: "YouTube casting is currently handled separately from native route casting." Lokalni MP4/HLS Cast ostane enak.

## START FULL DEMO

Na začetnem zaslonu **Start full demo** vklopi simulator tekalne steze, simulator utripa, izbere Lakeside Path in nastavi približno 6 km/h. Tek se začne šele, ko pritisneš **Start**.

## Kje je kaj

| Datoteka | Vloga |
| --- | --- |
| `src/treadmill/TreadmillTransport.ts` | vmesnik, ki ga uporabljata UI in workout |
| `src/treadmill/simulator/SimulatorTransport.ts` | virtualni pas |
| `src/treadmill/simulator/SimulatorEngine.ts` | pospeševanje, naklon, utrip, razdalja |
| `src/treadmill/bluetooth/WebBluetoothTransport.ts` | Web Bluetooth |
| `src/treadmill/bluetooth/FtmsProtocolAdapter.ts` | standardni FTMS |
| `src/treadmill/bluetooth/FtmsTreadmillParser.ts` | parser `0x2ACD` |
| `src/treadmill/bluetooth/protocolAdapter.ts` | mesto za kasnejši Kettler adapter |
| `src/treadmill/bluetooth/BleInspector.ts` | GATT poročilo |
| `src/workout/WorkoutEngine.ts` | čas, razdalja, auto incline, izbira utripa, izguba povezave tekalne steze |
| `src/heartRate/HeartRateSource.ts` | vmesnik za utrip, neodvisen od ure |
| `src/heartRate/ble/BluetoothHeartRateSource.ts` | standardni Heart Rate Service `0x180D` |
| `src/heartRate/ble/HeartRateMeasurementParser.ts` | paket `0x2A37` |
| `src/heartRate/simulator/SimulatorHeartRateSource.ts` | ročni in samodejni utrip |
| `src/video/LocalVideoOutput.ts` | obstoječi HTML5 predvajalnik |
| `src/video/createVideoOutput.ts` | izbira local ali YouTube iz media tipa |
| `src/video/CastVideoOutput.ts` | Google Cast sender |
| `src/youtube/YouTubeVideoOutput.ts` | uradni IFrame predvajalnik |
| `src/youtube/YouTubeApiLoader.ts` | enkratno nalaganje IFrame API |
| `src/youtube/parseYouTubeUrl.ts` | video id iz URL |
| `src/workout/walkingWorkouts.ts` | demo hoje |
| `src/video/CastSyncController.ts` | pragovi zamika za TV |
| `src/devices/DeviceManager.ts` | tekalna steza, utrip in video skupaj |
| `docs/CUSTOM_CAST_RECEIVER.md` | kasnejši TV overlay |
| `src/workout/WorkoutStateMachine.ts` | dovoljeni prehodi |
| `src/routes/RouteProgressEngine.ts` | sinhronizacija videa |
| `src/storage/workoutRepository.ts` | IndexedDB |
