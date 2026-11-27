/* Moje CRM → Google kalendář (Supabase Edge Function „gcal“).
 *
 * Zapisuje do kalendáře „CRM“ v Googlu vyhrané zakázky s termínem, nesplněné úkoly s termínem
 * a splatnosti odeslaných faktur, včetně upomínek. Běží na serveru, takže funguje i se zavřenou aplikací:
 * plánovač v databázi (supabase/google.sql) ji volá každých 10 minut, aplikace hned po změně.
 *
 * Nasazení: Supabase → Edge Functions → Deploy a new function → Via Editor, název „gcal“, vložit tento soubor.
 * V nastavení funkce vypněte „Verify JWT“ (přihlášení si funkce ověřuje sama).
 * Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. SUPABASE_URL a SUPABASE_DB_URL doplní Supabase sám.
 *
 * Akce (POST JSON { action, ... }):
 *   status | connect {code, redirectUri, ...prefs} | settings {...prefs} | sync | disconnect  – přihlášený uživatel
 *   cron  – plánovač (hlavička x-cron-key)
 */
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

const env = (k: string) => Deno.env.get(k) || '';
const SB_URL = env('SUPABASE_URL');
const CID = env('GOOGLE_CLIENT_ID').trim();
const CSECRET = env('GOOGLE_CLIENT_SECRET').trim();
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2 });

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const GCAL = 'https://www.googleapis.com/calendar/v3';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

/* ===================== Události z dat CRM (čistá logika) ===================== */
// Upomínky: minuty před začátkem (události začínají v 7:00).
const REMINDERS: Record<string, number> = { week: 7 * 1440, eve: 13 * 60, morning: 0 };
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const hex = (s: string) => Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, '0')).join('');
/** ID události v Googlu je odvozené z záznamu (znaky 0-9 a-v), takže se stejná položka vždy jen upraví. */
const eventId = (col: string, id: string) => 'crm' + hex(col + ':' + id);
const PROGRESS: Record<string, string> = { planned: 'Naplánováno', active: 'Probíhá', done: 'Hotovo', invoiced: 'Vyfakturováno' };

type Prefs = { reminders: string[]; email: boolean; currency: string; time_zone: string; app_url: string };

function overrides(p: Prefs, withWeek: boolean) {
  const keys = ['week', 'eve', 'morning'].filter(k => p.reminders.includes(k) && (withWeek || k !== 'week'));
  const list = keys.map(k => ({ method: 'popup', minutes: REMINDERS[k] }));
  const mailAt = keys.includes('eve') ? 'eve' : keys.includes('morning') ? 'morning' : null;
  if (p.email && mailAt) list.push({ method: 'email', minutes: REMINDERS[mailAt] });
  return list;
}

// deno-lint-ignore no-explicit-any
type Rec = Record<string, any>;
/** Vrátí { want: {eventId: událost}, keep: Set } – keep jsou staré položky mimo okno (nemazat, jen zapomenout). */
export function buildEvents(rows: { collection: string; id: string; data: Rec }[], p: Prefs) {
  const by: Record<string, Record<string, Rec>> = { contacts: {}, deals: {}, tasks: {}, invoices: {} };
  for (const r of rows) if (by[r.collection] && r.data) by[r.collection][r.id] = r.data;
  const tz = p.time_zone || 'Europe/Prague';
  const cut = addDays(todayIn(tz), -14); // starší položky už do Googlu neposílat
  const money = (n: unknown) => { try { return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: p.currency || 'CZK', maximumFractionDigits: 0 }).format(+(n as number) || 0); } catch (_) { return String(n); } };
  const link = (hash: string) => (p.app_url ? 'Otevřít v CRM: ' + p.app_url + hash : '');
  const who = (c: Rec | undefined) => c ? [c.name && 'Klient: ' + c.name + (c.company ? ' (' + c.company + ')' : ''), c.phone && 'Telefon: ' + c.phone, c.email && 'E-mail: ' + c.email, c.address && 'Adresa: ' + c.address] : [];
  const text = (lines: unknown[]) => lines.filter(Boolean).join('\n');
  const when = (from: string, to: string, t1: string, t2: string) => ({
    start: { dateTime: `${from}T${t1}:00`, timeZone: tz }, end: { dateTime: `${to}T${t2}:00`, timeZone: tz },
  });
  const want: Record<string, Rec> = {};
  const keep = new Set<string>();
  const put = (col: string, id: string, end: string, ev: Rec) => {
    const eid = eventId(col, id);
    if (end < cut) keep.add(eid); else want[eid] = Object.assign({ id: eid, status: 'confirmed', transparency: 'opaque' }, ev);
  };

  for (const [id, d] of Object.entries(by.deals)) {
    if (d.stage !== 'won' || !isDate(d.dateFrom)) continue;
    const end = isDate(d.dateTo) && d.dateTo >= d.dateFrom ? d.dateTo : d.dateFrom;
    const c = by.contacts[d.contactId];
    put('deals', id, end, {
      summary: 'Zakázka: ' + (d.title || 'bez názvu'),
      description: text([...who(c), +d.value ? 'Cena: ' + money(d.value) : '', 'Průběh: ' + (PROGRESS[d.progress] || PROGRESS.planned), d.note ? '\n' + d.note : '', '', link('#/deal/' + encodeURIComponent(id))]),
      location: (c && c.address) || undefined,
      colorId: '9',
      ...when(d.dateFrom, end, '07:00', '17:00'),
      reminders: { useDefault: false, overrides: overrides(p, true) },
    });
  }
  for (const [id, t] of Object.entries(by.tasks)) {
    if (t.done || !isDate(t.due)) continue;
    const c = by.contacts[t.contactId];
    put('tasks', id, t.due, {
      summary: 'Úkol: ' + (t.title || 'bez názvu') + (t.priority === 'high' ? ' (!)' : ''),
      description: text([t.priority === 'high' ? 'Vysoká priorita' : '', ...who(c), t.note ? '\n' + t.note : '', '', link('#/tasks')]),
      colorId: '5',
      ...when(t.due, t.due, '07:00', '07:30'),
      reminders: { useDefault: false, overrides: overrides(p, false) },
    });
  }
  for (const [id, i] of Object.entries(by.invoices)) {
    if (i.status !== 'sent' || !isDate(i.dueDate)) continue;
    const c = by.contacts[i.contactId];
    put('invoices', id, i.dueDate, {
      summary: 'Splatnost faktury ' + (i.number || '') + (c && c.name ? ' – ' + c.name : ''),
      description: text(['Částka: ' + money(i.amount), ...who(c), i.note ? '\n' + i.note : '', '', link('#/invoices')]),
      colorId: '11',
      ...when(i.dueDate, i.dueDate, '07:00', '07:30'),
      reminders: { useDefault: false, overrides: overrides(p, false) },
    });
  }
  return { want, keep };
}

/* ===================== Google ===================== */
async function token(form: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, client_secret: CSECRET, ...form }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === 'invalid_grant') throw Object.assign(fail('Propojení s Googlem vypršelo nebo bylo zrušeno. Propojte kalendář znovu.'), { relink: true });
    throw fail('Google odmítl přihlášení: ' + (j.error_description || j.error || r.status));
  }
  return j;
}

async function g(tok: string, method: string, path: string, body?: unknown) {
  const r = await fetch(GCAL + path, {
    method,
    headers: { Authorization: 'Bearer ' + tok, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, j };
}
const gErr = (r: { status: number; j: Rec }) => (r.j && r.j.error && r.j.error.message) || 'chyba ' + r.status;

async function ensureCalendar(tok: string, link: Rec) {
  if (link.calendar_id) {
    const r = await g(tok, 'GET', '/calendars/' + encodeURIComponent(link.calendar_id));
    if (r.ok) return { id: link.calendar_id, fresh: false };
    if (r.status !== 404 && r.status !== 403) throw fail('Google kalendář: ' + gErr(r));
  }
  const r = await g(tok, 'POST', '/calendars', {
    summary: 'CRM',
    description: 'Zakázky, úkoly a splatnosti faktur z aplikace Moje CRM. Plní se automaticky – změny dělejte v CRM.',
    timeZone: link.time_zone || 'Europe/Prague',
  });
  if (!r.ok) throw fail('Kalendář CRM v Googlu se nepodařilo vytvořit: ' + gErr(r));
  return { id: r.j.id as string, fresh: true };
}

/** Stejný obsah = stejný otisk; nezměněné události se do Googlu neposílají znovu. */
function digest(o: unknown) {
  const s = JSON.stringify(o);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = items.slice();
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift() as T); }));
}

async function syncUser(link: Rec) {
  try {
    const { access_token: tok } = await token({ refresh_token: link.refresh_token, grant_type: 'refresh_token' });
    const cal = await ensureCalendar(tok, link);
    const sent: Record<string, string> = cal.fresh ? {} : (link.sent || {});
    const rows = await sql`select collection, id, data from public.records
      where user_id = ${link.user_id} and deleted = false and collection in ('contacts', 'deals', 'tasks', 'invoices')`;
    const { want, keep } = buildEvents(rows as unknown as { collection: string; id: string; data: Rec }[], link as unknown as Prefs);
    const next: Record<string, string> = {};
    const errors: string[] = [];
    const base = '/calendars/' + encodeURIComponent(cal.id) + '/events';

    await pool(Object.keys(want), 5, async eid => {
      const ev = want[eid], h = digest(ev);
      if (sent[eid] === h) { next[eid] = h; return; }
      let r = await g(tok, 'PUT', base + '/' + eid, ev);           // úprava (obnoví i dříve smazanou)
      if (r.status === 404) r = await g(tok, 'POST', base, ev);     // nová
      if (r.ok) next[eid] = h;
      else { if (sent[eid]) next[eid] = sent[eid]; errors.push(ev.summary + ': ' + gErr(r)); }
    });
    await pool(Object.keys(sent).filter(eid => !want[eid] && !keep.has(eid)), 5, async eid => {
      const r = await g(tok, 'DELETE', base + '/' + eid);
      if (!(r.ok || r.status === 404 || r.status === 410)) { next[eid] = sent[eid]; errors.push('Smazání: ' + gErr(r)); }
    });

    const err = errors.length ? `Nepodařilo se odeslat ${errors.length}× – ${errors[0]}` : null;
    await sql`update public.gcal_links set calendar_id = ${cal.id}, sent = ${sql.json(next)}, last_sync = now(),
      last_error = ${err}, needs_relink = false where user_id = ${link.user_id}`;
  } catch (e) {
    const err = e as Error & { relink?: boolean };
    await sql`update public.gcal_links set last_error = ${err.message}, needs_relink = ${!!err.relink} where user_id = ${link.user_id}`;
  }
}

/* ===================== Uživatel a akce ===================== */
async function userId(req: Request) {
  const r = await fetch(SB_URL + '/auth/v1/user', {
    headers: { Authorization: req.headers.get('authorization') || '', apikey: req.headers.get('apikey') || '' },
  });
  if (!r.ok) throw fail('Nejste přihlášen.', 401);
  const u = await r.json();
  if (!u || !u.id) throw fail('Nejste přihlášen.', 401);
  return u.id as string;
}

const getLink = async (uid: string) => (await sql`select * from public.gcal_links where user_id = ${uid}`)[0] as Rec | undefined;

async function status(uid: string) {
  const l = await getLink(uid);
  return {
    ready: !!(CID && CSECRET), clientId: CID || null, linked: !!l,
    lastSync: l ? l.last_sync : null, lastError: l ? l.last_error : null, needsRelink: l ? l.needs_relink : false,
    reminders: l ? l.reminders : null, email: l ? l.email : null,
    count: l && l.sent ? Object.keys(l.sent).length : 0,
  };
}

function prefs(b: Rec) {
  const out: Rec = {};
  if (Array.isArray(b.reminders)) out.reminders = b.reminders.filter((k: string) => k in REMINDERS);
  if (typeof b.email === 'boolean') out.email = b.email;
  if (typeof b.currency === 'string' && /^[A-Z]{3}$/.test(b.currency)) out.currency = b.currency;
  if (typeof b.timeZone === 'string' && b.timeZone.length < 64) { try { todayIn(b.timeZone); out.time_zone = b.timeZone; } catch (_) { /* neznámé pásmo */ } }
  if (typeof b.appUrl === 'string' && /^https?:\/\/[^\s]+$/.test(b.appUrl) && b.appUrl.length < 300) out.app_url = b.appUrl;
  return out;
}

async function connect(uid: string, b: Rec) {
  if (!CID || !CSECRET) throw fail('V Supabase chybí GOOGLE_CLIENT_ID nebo GOOGLE_CLIENT_SECRET.');
  if (!b.code || !b.redirectUri) throw fail('Chybí kód od Googlu.');
  const t = await token({ code: String(b.code), redirect_uri: String(b.redirectUri), grant_type: 'authorization_code' });
  if (!t.refresh_token) throw fail('Google nevrátil trvalé oprávnění. Zkuste propojení znovu.');
  if (t.scope && !String(t.scope).includes(SCOPE)) throw fail('Při propojení nebylo povoleno spravovat kalendář. Zkuste to znovu a oprávnění povolte.');
  const p = { reminders: ['week', 'eve', 'morning'], email: true, currency: 'CZK', time_zone: 'Europe/Prague', app_url: '', ...prefs(b) };
  await sql`insert into public.gcal_links (user_id, refresh_token, reminders, email, currency, time_zone, app_url)
    values (${uid}, ${t.refresh_token}, ${p.reminders}, ${p.email}, ${p.currency}, ${p.time_zone}, ${p.app_url})
    on conflict (user_id) do update set refresh_token = excluded.refresh_token, reminders = excluded.reminders, email = excluded.email,
      currency = excluded.currency, time_zone = excluded.time_zone, app_url = excluded.app_url, last_error = null, needs_relink = false`;
  await syncUser((await getLink(uid)) as Rec);
}

async function disconnect(uid: string) {
  const l = await getLink(uid);
  if (!l) return;
  try {
    const { access_token: tok } = await token({ refresh_token: l.refresh_token, grant_type: 'refresh_token' });
    if (l.calendar_id) await g(tok, 'DELETE', '/calendars/' + encodeURIComponent(l.calendar_id));
  } catch (_) { /* propojení už neplatí – v Googlu není co mazat */ }
  await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(l.refresh_token), { method: 'POST' }).catch(() => {});
  await sql`delete from public.gcal_links where user_id = ${uid}`;
}

async function cron(req: Request) {
  const key = req.headers.get('x-cron-key') || '';
  const row = (await sql`select cron_key from public.gcal_private where id = 1`)[0];
  if (!row || !key || key !== row.cron_key) throw fail('Neplatný klíč plánovače.', 403);
  const links = await sql`select * from public.gcal_links where needs_relink = false`;
  for (const l of links) await syncUser(l as Rec);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === 'cron') { await cron(req); return json({ ok: true }); }
    const uid = await userId(req);
    switch (b.action) {
      case 'status': break;
      case 'connect': await connect(uid, b); break;
      case 'settings': {
        const p = prefs(b);
        if (Object.keys(p).length) {
          await sql`update public.gcal_links set ${sql(p)} where user_id = ${uid}`;
        }
        const l = await getLink(uid);
        if (l) await syncUser(l);
        break;
      }
      case 'sync': { const l = await getLink(uid); if (l) await syncUser(l); break; }
      case 'disconnect': await disconnect(uid); break;
      default: throw fail('Neznámá akce.');
    }
    return json(await status(uid));
  } catch (e) {
    const err = e as Error & { status?: number };
    if (!err.status) console.error(err);
    return json({ error: err.message || String(err) }, err.status || 500);
  }
});
