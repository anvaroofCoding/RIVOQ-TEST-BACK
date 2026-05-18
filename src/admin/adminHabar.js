import {
  listNotificationRecipients,
  sendNotificationsToUsers,
} from '../services/adminNotificationService.js';

function currentAdmin(req) {
  return req.session?.adminUser || null;
}

function canHabar(adm) {
  return !!adm && (adm.role === 'company' || adm.role === 'admin');
}

function companyIdFromAdmin(adm) {
  if (adm.role === 'company') return String(adm.id);
  return null;
}

/** AdminJS router `express-formidable` ishlatadi — JSON emas, FormData / fields */
function pickField(fields, body, key) {
  const src = { ...(fields && typeof fields === 'object' ? fields : {}), ...(body && typeof body === 'object' ? body : {}) };
  let v = src[key];
  if (Array.isArray(v)) v = v.length ? v[0] : '';
  if (v && typeof v === 'object' && 'value' in v) v = v.value;
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function pickUserIds(req) {
  const fields = req.fields || {};
  const raw = fields.userIds;
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (raw != null && raw !== '') {
    const s = String(raw).trim();
    return s ? [s] : [];
  }
  const one = pickField(fields, req.body, 'userIds');
  if (!one) return [];
  if (one.startsWith('[')) {
    try {
      const parsed = JSON.parse(one);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x).trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return [one];
}

export function attachHabarRoutes(adminRouter) {
  adminRouter.get('/custom/habar/recipients', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canHabar(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const companyId = companyIdFromAdmin(adm);
      const search = String(req.query.search || '').trim();
      const recipients = await listNotificationRecipients(companyId, { search });

      return res.json({
        ok: true,
        recipients,
        role: adm.role,
        scope: companyId ? 'company_test_participants' : 'all_users',
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });

  adminRouter.post('/custom/habar/send', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canHabar(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const userIds = pickUserIds(req);
      const title = pickField(req.fields, req.body, 'title');
      const body = pickField(req.fields, req.body, 'body');

      const result = await sendNotificationsToUsers({
        userIds,
        title,
        body,
        sender: { role: adm.role, id: adm.id, name: adm.title || adm.email },
      });

      return res.json({
        ok: true,
        message: `${result.sent} ta foydalanuvchiga yuborildi`,
        sent: result.sent,
      });
    } catch (e) {
      return res.status(400).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });
}
