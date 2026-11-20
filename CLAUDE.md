# Moje CRM – pokyny pro Claude Code

Osobní CRM pro malý byznys. Majitel posílá úpravy v češtině a bez technických detailů, takže je vždy převeď na konkrétní změnu v kódu.

## Technologie
- Čisté HTML, CSS a JavaScript. **Žádný build, žádný npm, žádný framework.** Aplikace musí fungovat i po otevření `index.html` dvojklikem (file://), takže nepoužívej ES moduly (`import`/`export`) ani `fetch` lokálních souborů.
- Skripty jsou klasické `<script>` v pevném pořadí v `index.html`: `store → ui → schema → components → views/* → app`. Nový soubor přidej tam.
- Globální jmenné prostory: `Store`, `UI`, `Schema`, `C` (komponenty), `Views`.

## Struktura
| Soubor | Účel |
|---|---|
| `js/store.js` | Data v `localStorage` (klíč `crm-data-v1`), CRUD, export/import, ukázková data, migrace |
| `js/ui.js` | Ikony (SVG), formátování (datum, měna `cs-CZ`), modální okno, generátor formulářů, toast |
| `js/schema.js` | Entity a jejich pole formulářů, číselníky (fáze obchodu, stavy faktur, priority) |
| `js/components.js` | Sdílené řádky a karty (úkol, faktura, obchod, avatar, pill) |
| `js/views/*.js` | Jednotlivé obrazovky: `{ title, actions(), render(el, id), nav?, back? }` |
| `js/app.js` | Hash router (`#/stranka/id`), navigace, globální `data-*` akce |
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
- ≥1100 px: plný postranní panel. 721–1100 px (iPad): úzký panel jen s ikonami. ≤720 px (telefon): spodní lišta, formuláře jako spodní panel.
- Dotykové cíle aspoň ~40 px, inputy `font-size: 16px` (jinak iOS zoomuje), respektuj `env(safe-area-inset-*)`.
- Přetahování v kanbanu funguje jen myší, na dotyku slouží šipky na kartě. Nové funkce nesmí záviset jen na hoveru nebo drag&drop.

## Ověření změn
- Spusť náhled `crm` z `.claude/launch.json` a zkontroluj změnu na šířce 375 px (telefon), 820 px (iPad) a na desktopu, ve světlém i tmavém režimu. V konzoli nesmí být chyby.
- Po hotové úpravě udělej commit s krátkou českou zprávou, co se změnilo.
