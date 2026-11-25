/* Připojení ke cloudu (Supabase). Když jsou hodnoty prázdné, aplikace běží jen lokálně v prohlížeči.
 * Obě hodnoty najdete v Supabase → Project Settings → API (Data API):
 *   supabaseUrl     = Project URL
 *   supabaseAnonKey = klíč „anon“ / „publishable“ (je veřejný, smí být v kódu).
 * NIKDY sem nedávejte klíč „service_role“ / „secret“ ani heslo k databázi. */
window.CRM_CONFIG = {
  supabaseUrl: 'https://gscysvybyluqypqskwpp.supabase.co',
  supabaseAnonKey: 'sb_publishable_PZipOAo7g3ZG6PilI0Bx7A_VNoeSubi',
};
