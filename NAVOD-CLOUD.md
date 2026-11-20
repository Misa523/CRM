# Návod: CRM na všech zařízeních se synchronizací

Celé nastavení zabere asi 10–15 minut. Stačí to udělat jednou.

## Část A – Supabase (databáze a přihlášení)

1. Otevřete **https://supabase.com** → **Start your project** a zaregistrujte se (e-mailem nebo přes GitHub).
2. Klikněte na **New project**:
   - **Name:** `crm`
   - **Database Password:** klikněte na *Generate a password* a uložte si ho do správce hesel. **Nikomu ho neposílejte, ani Claudovi.**
   - **Region:** `Central EU (Frankfurt)` – data zůstanou v EU.
   - Klikněte na **Create new project** a počkejte zhruba minutu.
3. V levém menu otevřete **SQL Editor** → **New query**. Vložte celý obsah souboru `supabase/schema.sql` z této složky a klikněte na **Run**. Mělo by se objevit *Success. No rows returned*.
4. Vytvořte si svůj účet: **Authentication** → **Users** → **Add user** → **Create new user**
   - vyplňte svůj e-mail a heslo, kterým se budete do CRM přihlašovat,
   - zaškrtněte **Auto Confirm User** a klikněte na **Create user**.
5. Vypněte registraci cizích lidí: **Authentication** → **Sign In / Providers** (případně **Settings**) → vypněte **Allow new users to sign up** → **Save**.
6. Zkopírujte dvě hodnoty: **Project Settings** (ozubené kolečko) → **Data API** / **API Keys**:
   - **Project URL** (např. `https://abcdefgh.supabase.co`)
   - klíč **anon / public** (případně **publishable**)

   Tyto dvě hodnoty pošlete Claudovi. Jsou určené do aplikace a poslat je můžete.
   **Neposílejte** klíč `service_role` / `secret` ani heslo k databázi.

## Část B – GitHub (webová adresa aplikace)

1. Otevřete **https://github.com** a zaregistrujte se.
2. Vpravo nahoře klikněte na **+** → **New repository**:
   - **Repository name:** `crm`
   - **Public** (je to jen kód aplikace, vaše data jsou v Supabase)
   - nic dalšího nezaškrtávejte → **Create repository**
3. Adresu repozitáře (např. `https://github.com/vasejmeno/crm`) pošlete Claudovi. Nahraje do něj aplikaci.
   Při prvním nahrání se otevře okno s přihlášením ke GitHubu, přihlaste se v něm.
4. Až bude kód nahraný: v repozitáři otevřete **Settings** → **Pages** → **Branch:** `main`, složka `/ (root)` → **Save**.
   Zhruba za minutu bude aplikace na adrese `https://vasejmeno.github.io/crm/`.

## Část C – Zařízení

- **Počítač:** otevřete adresu aplikace a přihlaste se. V Chromu nebo Edge můžete v adresním řádku kliknout na **Nainstalovat**.
- **iPhone / iPad:** otevřete adresu v **Safari** → **Sdílet** → **Přidat na plochu**. Aplikace se pak otevírá jako běžná aplikace.
- Při prvním přihlášení se aplikace zeptá, co s daty, která už v zařízení máte (nahrát do cloudu, nebo začít načisto).

## Dobré vědět

- Změny se odesílají hned a ostatní zařízení si je stáhnou do ~15 sekund (a vždy při otevření aplikace).
- Bez internetu aplikace funguje dál, změny se odešlou po připojení.
- Bezplatný Supabase projekt se po 7 dnech bez používání uspí. Probudíte ho v administraci Supabase tlačítkem **Restore project**, data se neztratí.
- Na cizím zařízení se po práci odhlaste (Nastavení → Odhlásit → smazat data ze zařízení).
