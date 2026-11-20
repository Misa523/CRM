# Moje CRM – pokyny pro Claude Code

Osobní CRM pro malý byznys. Majitel posílá úpravy v češtině a bez technických detailů, takže je vždy převeď na konkrétní změnu v kódu.

## Technologie
- Čisté HTML, CSS a JavaScript. **Žádný build, žádný npm, žádný framework.** Aplikace musí fungovat i po otevření `index.html` dvojklikem (file://), takže nepoužívej ES moduly (`import`/`export`) ani `fetch` lokálních souborů.
- Skripty jsou klasické `<script>` v pevném pořadí v `index.html`: `store → ui → schema → components → charts → views/* → app`. Grafy nepřidávej přes knihovny z CDN, aplikace musí fungovat i offline. Nový soubor přidej tam.
- Globální jmenné prostory: `Store`, `UI`, `Schema`, `C` (komponenty), `Views`.

## Struktura
| Soubor | Účel |
|---|---|
| `js/store.js` | Data v `localStorage` (klíč `crm-data-v1`), CRUD, export/import, ukázková data, migrace |
| `js/ui.js` | Ikony (SVG), formátování (datum, měna `cs-CZ`), modální okno, generátor formulářů, toast |
| `js/schema.js` | Entity a jejich pole formulářů, číselníky (fáze obchodu, stavy faktur, priority) |
| `js/components.js` | `C.table` (řaditelná tabulka), `C.filterPanel` + `C.listShell` (filtry vlevo), `C.cols.*` (sloupce úkolů, faktur, obchodů), avatar, pill |
| `js/charts.js` | Vlastní SVG grafy bez knihoven: `Charts.line`, `bars`, `donutBlock`, `hbars`, `legend`. `Charts.mount(el, w => svg)` překreslí graf podle šířky, `Charts.reset()` na začátku renderu. Bublina s hodnotou přes atribut `data-tip`. Barvy řad třídami `s-primary`, `s-green`… |
| `js/views/*.js` | Jednotlivé obrazovky: `{ title, subtitle?, actions(), render(el, id), nav?, back?, hideHead? }` |
| `js/app.js` | Hash router (`#/stranka/id`), horní lišta s moduly, menu „Vytvořit“ (+), globální `data-*` akce |

## Vzhled (styl firemního CRM)
- Tmavá horní lišta s moduly (Domů, Kontakty, Obchody, Úkoly, Faktury), vpravo „+“ pro rychlé vytvoření a ikona Nastavení.
- Seznamy = tabulka (`C.table`) s filtračním panelem vlevo a hledáním nahoře. Řádek otevře záznam (`data-href` nebo `data-edit`).
- Detail kontaktu = karta záznamu: hlavička s akcemi, vlevo „Související seznamy“, vpravo sekce s poli a souvisejícími tabulkami.
- Nový seznam stav stejně: `C.listShell(C.filterPanel(...), toolbar)` a do `#list` vlož `C.table(...)`.
- Sloupec tabulky: `{ key, label, cls, sort?, render }`. Třídy `cls`: `primary` (hlavní sloupec), `num` (číslo vpravo), `c-check`, `c-act`, `hide-md` (skryje se na iPadu na výšku). Prázdná buňka se zobrazí jako „—“.
- Žádné logo, název ani barvy Zoho ani jiné značky nekopíruj, styl je jen inspirace.
| `css/styles.css` | Všechny styly. Barvy jako CSS proměnné v `:root`, tmavý režim přes `prefers-color-scheme` |

## Datový model
- `contacts`: `name, company, email, phone, ico, address, tags[], note, activities[{id,date,text}]`
- `deals`: `title, contactId, value, stage (lead|contacted|offer|negotiation|won|lost), expectedDate, wonDate, note`
- `tasks`: `title, contactId, due, priority (high|normal|low), done, doneAt, note`
- `invoices`: `number, contactId, amount, status (draft|sent|paid), issueDate, dueDate, paidDate, note`. Stav „po splatnosti“ se počítá (sent + dueDate < dnes).
- Data uživatele jsou reálná. **Při změně tvaru dat** zvyš `SCHEMA_VERSION` ve `store.js` a doplň převod v `migrate()`, aby stará data i staré zálohy fungovaly dál. Nikdy existující data nemaž ani nepřejmenovávej pole bez migrace.

## Konvence
- Celé UI je česky. Peníze přes `UI.money()`, data přes `UI.fmtDate()`. Datum ukládej jako `YYYY-MM-DD`.
- Veškerý uživatelský text vkládaný do HTML musí jít přes `UI.esc()`.
- Akce přes atributy: `data-new="col"` (+ `data-preset` JSON), `data-edit="col" data-id`, `data-toggle-task`, `data-move`, `data-mark-paid`. Obsluhu najdeš v `app.js`.
- Po každém `Store.add/update/remove` se aktuální obrazovka sama překreslí (`Store.onChange`).
- Nové pole formuláře stačí přidat do `Schema.ENTITIES[col].fields()`.

## Responzivita (musí platit vždy)
- >1100 px: filtry jako panel vlevo. ≤1100 px: filtry jako řada štítků nad tabulkou. ≤900 px: skryjí se sloupce `hide-md`. ≤720 px (telefon): moduly ve spodní liště, tabulky se přeskládají do karet, formuláře jako spodní panel.
- Dotykové cíle aspoň ~40 px, inputy `font-size: 16px` (jinak iOS zoomuje), respektuj `env(safe-area-inset-*)`.
- Přetahování v kanbanu funguje jen myší, na dotyku slouží šipky na kartě. Nové funkce nesmí záviset jen na hoveru nebo drag&drop.

## Ověření změn
- Spusť náhled `crm` z `.claude/launch.json` a zkontroluj změnu na šířce 375 px (telefon), 820 px (iPad) a na desktopu, ve světlém i tmavém režimu. V konzoli nesmí být chyby.
- Po hotové úpravě udělej commit s krátkou českou zprávou, co se změnilo.
