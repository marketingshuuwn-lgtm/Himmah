// Paginated helpers around supabaseAdmin.auth.admin.listUsers.
// Fixes:
//  - roles admin previously fetched only page 1 (200 users cap) — emails
//    silently disappeared beyond 200 users.
//  - employee import previously fetched perPage:1 and searched that single
//    user for an email match — existence check was effectively broken.

type AdminClient = {
  auth: {
    admin: {
      listUsers: (opts: { page: number; perPage: number }) => Promise<{
        data: { users: Array<{ id: string; email?: string | null }> } | null;
        error: unknown;
      }>;
    };
  };
};

const PER_PAGE = 1000;
const MAX_PAGES = 30; // safety bound (30k users)

/** All auth users as a map of user_id -> email. */
export async function listAllAuthUserEmails(
  supabaseAdmin: AdminClient,
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) map.set(u.id, u.email ?? null);
    if (users.length < PER_PAGE) break;
  }
  return map;
}

/** Find an auth user by exact email (case-insensitive). Null if not found. */
export async function findAuthUserByEmail(
  supabaseAdmin: AdminClient,
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === needle);
    if (found) return { id: found.id, email: found.email ?? null };
    if (users.length < PER_PAGE) break;
  }
  return null;
}
