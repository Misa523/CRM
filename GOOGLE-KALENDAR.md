# Propojení s Google kalendářem – jednorázové nastavení

Po nastavení se do Google kalendáře „CRM“ samy zapisují:
- vyhrané zakázky s termínem práce,
- nesplněné úkoly s termínem,
- splatnosti odeslaných faktur.

Upomínky posílá Google. Záznamy v Googlu se upraví i při změně termínu a zmizí po smazání, po splnění úkolu nebo po zaplacení faktury. Všechno běží na serveru, takže to funguje i se zavřenou aplikací (kontrola každých 10 minut, po změně v aplikaci hned).

Celé nastavení zabere asi 15 minut. **Klíč „Client secret“ nikomu neposílejte a nikam do aplikace ho nevkládejte**, patří jen do Supabase (krok 3).

## 1. Google Cloud (přihlášení k Googlu)
1. Otevřete https://console.cloud.google.com, nahoře vlevo klikněte na výběr projektu → **Nový projekt** → název `Moje CRM` → **Vytvořit**. Pak ho nahoře vyberte.
2. Do vyhledávání nahoře napište **Google Calendar API**, otevřete ji a klikněte **Povolit (Enable)**.
3. V menu vlevo **APIs & Services → OAuth consent screen** (může se jmenovat i **Google Auth Platform**) → **Get started**:
   - App name: `Moje CRM`, User support email: váš e-mail → Next
   - Audience: **External** → Next
   - Contact information: váš e-mail → Next → souhlas → **Create**
4. Vlevo **Audience** → **Publish app** → Confirm. (Jinak by propojení po 7 dnech přestalo fungovat.)
5. Vlevo **Clients** → **Create client**:
   - Application type: **Web application**, Name: `Moje CRM`
   - **Authorized JavaScript origins** → Add URI: `https://misa523.github.io`
   - **Authorized redirect URIs** → Add URI: `https://misa523.github.io/CRM/` (i s lomítkem na konci)
   - **Create**. Zobrazí se **Client ID** a **Client secret**. Okno nezavírejte, obě hodnoty budete potřebovat v kroku 3.

## 2. Supabase – serverová funkce
1. Otevřete svůj projekt na https://supabase.com/dashboard → vlevo **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Název funkce: `gcal`. Smažte ukázkový kód a vložte celý obsah souboru `supabase/functions/gcal/index.ts`. Pak klikněte **Deploy function**.
3. Po nasazení otevřete funkci `gcal` → záložka **Details** (nebo **Settings**) → vypněte **Verify JWT with legacy secret** (Enforce JWT verification) → **Save**. Přihlášení si funkce ověřuje sama.

## 3. Supabase – tajné klíče
**Edge Functions → Secrets** a přidejte dva:
- `GOOGLE_CLIENT_ID` = Client ID z kroku 1.5
- `GOOGLE_CLIENT_SECRET` = Client secret z kroku 1.5

Pak **Save**.

## 4. Supabase – databáze a plánovač
**SQL Editor → New query** → vložte celý soubor `supabase/google.sql` → **Run**. Má skončit bez chyby.

## 5. Propojení v aplikaci (nejlépe na počítači)
1. V CRM otevřete **Nastavení → Google kalendář**, zaškrtněte upomínky a klikněte **Propojit s Google kalendářem**.
2. Vyberte svůj Google účet. Google upozorní, že aplikace není ověřená. Je to vaše vlastní aplikace, takže klikněte **Pokročilé (Advanced) → Přejít na Moje CRM** a povolte přístup.
3. Vrátíte se do CRM a v Googlu se objeví kalendář **CRM**.

Na iPhonu si nainstalujte aplikaci **Google Kalendář**, přihlaste se a povolte oznámení. Upomínky pak chodí na telefon a e-mailem, pokud ho máte v nastavení zapnutý.

Propojení stačí udělat jednou, na jednom zařízení. Platí pro váš účet v CRM, takže se do Googlu dostanou i změny z telefonu a iPadu.
