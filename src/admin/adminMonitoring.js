import mongoose from 'mongoose';
import {
  getParticipantMonitoringDetail,
  listMonitoringParticipants,
} from '../services/companyInviteService.js';

function currentAdmin(req) {
  return req.session?.adminUser || null;
}

function canMonitoring(adm) {
  return !!adm && (adm.role === 'company' || adm.role === 'admin');
}

function companyIdFromAdmin(adm) {
  if (adm.role === 'company') return String(adm.id);
  return null;
}

export function attachMonitoringRoutes(adminRouter) {
  adminRouter.get('/custom/monitoring/participants', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canMonitoring(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const companyId = companyIdFromAdmin(adm);
      const search = String(req.query.search || '').trim();
      const participants = await listMonitoringParticipants(companyId, { search });

      return res.json({ ok: true, participants, role: adm.role });
    } catch (e) {
      return res.status(500).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });

  adminRouter.get('/custom/monitoring/participants/:sessionId', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canMonitoring(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const sessionId = req.params.sessionId;
      if (!mongoose.isValidObjectId(sessionId)) {
        return res.status(400).json({ ok: false, message: 'sessionId noto‘g‘ri' });
      }

      const companyId = companyIdFromAdmin(adm);
      const data = await getParticipantMonitoringDetail(sessionId, companyId);
      if (!data) return res.status(404).json({ ok: false, message: 'Topilmadi' });

      return res.json({ ok: true, ...data });
    } catch (e) {
      return res.status(500).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });
}
