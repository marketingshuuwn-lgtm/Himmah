// Safe mapping of Postgres / PostgREST errors to user-friendly messages.
// Hides table/column/constraint names from clients while logging full detail server-side.

type PgLike = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

export function mapDbError(err: PgLike, fallback = "حدث خطأ في قاعدة البيانات، يرجى المحاولة مجددًا"): Error {
  try {
    console.error("[DB]", err);
  } catch {
    // ignore
  }
  const code = err?.code ?? "";
  switch (code) {
    case "23505": return new Error("القيمة موجودة مسبقًا");
    case "23503": return new Error("لا يمكن تنفيذ العملية: سجل مرتبط مفقود أو مستخدم");
    case "23502": return new Error("حقل مطلوب مفقود");
    case "23514": return new Error("القيمة المُدخلة غير صالحة");
    case "22P02": return new Error("صيغة غير صحيحة في أحد الحقول");
    case "42501":
    case "PGRST301":
    case "PGRST302":
      return new Error("لا تملك صلاحية لتنفيذ هذه العملية");
    case "P0001": // raise_exception
      // RAISE EXCEPTION messages from our own triggers are written for end-users.
      return new Error(err?.message || fallback);
    default:
      return new Error(fallback);
  }
}
