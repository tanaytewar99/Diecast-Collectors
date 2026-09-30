// POST {} -> { ok: true }. Permanently deletes the caller's account, cars and photos.
import { adminClient, requireUser } from '../_shared/auth.ts';
import { handler, json } from '../_shared/http.ts';

Deno.serve(
  handler(async (req) => {
    const user = await requireUser(req);
    const admin = adminClient();
    const bucket = admin.storage.from('car-photos');
    for (;;) {
      const { data: files, error } = await bucket.list(user.id, { limit: 1000 });
      if (error) throw error;
      if (!files?.length) break;
      const { error: removeError } = await bucket.remove(files.map((f) => `${user.id}/${f.name}`));
      if (removeError) throw removeError;
    }
    // Cars and scan usage are removed by ON DELETE CASCADE.
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return json({ ok: true });
  }),
);
