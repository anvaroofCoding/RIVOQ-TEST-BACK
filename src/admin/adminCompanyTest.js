import mongoose from 'mongoose';
import { blockUserForCompany, unblockUserForCompany } from '../services/companyBlockService.js';
import {
  buildParticipantRowsForInvite,
  closeInviteById,
  createInviteForTopic,
  listInvitesForCompany,
} from '../services/companyInviteService.js';
import { createMultiTopicInvite } from '../services/companyMultiTestService.js';
import { TopicInviteCode } from '../models/TopicInviteCode.js';

function currentAdmin(req) {
  return req.session?.adminUser || null;
}

function companyIdFromAdmin(adm, body = {}) {
  if (adm.role === 'company') return String(adm.id);
  const q = String(body.companyId || '').trim();
  if (mongoose.isValidObjectId(q)) return q;
  return null;
}

function canCompanyPanel(adm) {
  return !!adm && (adm.role === 'company' || adm.role === 'admin');
}

export function attachCompanyTestRoutes(adminRouter) {
  adminRouter.get('/custom/company/invites', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canCompanyPanel(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const companyId = companyIdFromAdmin(adm, req.query);
      const page = Number(req.query.page) || 1;
      const limit = Math.min(100, Number(req.query.limit) || 50);
      const data = await listInvitesForCompany(companyId, { page, limit });
      return res.json({ ok: true, ...data });
    } catch (e) {
      return res.status(500).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });

  adminRouter.get('/custom/company/invites/:inviteId/participants', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canCompanyPanel(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const inv = await TopicInviteCode.findById(req.params.inviteId).lean();
      if (!inv) return res.status(404).json({ ok: false, message: 'Topilmadi' });

      const companyId = companyIdFromAdmin(adm, req.query);
      if (adm.role === 'company' && String(inv.company) !== String(companyId)) {
        return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });
      }

      const rows = await buildParticipantRowsForInvite(inv);
      return res.json({ ok: true, invite: inv, participants: rows });
    } catch (e) {
      return res.status(500).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });

  adminRouter.post('/custom/company/participants/block', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canCompanyPanel(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const userId = String(req.body?.userId || '').trim();
      const companyId = companyIdFromAdmin(adm, req.body);
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ ok: false, message: 'userId noto‘g‘ri' });
      }
      if (!companyId) {
        return res.status(400).json({ ok: false, message: 'companyId kerak' });
      }

      await blockUserForCompany(userId, companyId, req.body?.reason);
      return res.json({ ok: true, message: 'Bloklandi' });
    } catch (e) {
      return res.status(400).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });

  adminRouter.post('/custom/company/participants/unblock', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canCompanyPanel(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const userId = String(req.body?.userId || '').trim();
      const companyId = companyIdFromAdmin(adm, req.body);
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ ok: false, message: 'userId noto‘g‘ri' });
      }
      if (!companyId) {
        return res.status(400).json({ ok: false, message: 'companyId kerak' });
      }

      await unblockUserForCompany(userId, companyId);
      return res.json({ ok: true, message: 'Blok olib tashlandi' });
    } catch (e) {
      return res.status(400).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });

  adminRouter.post('/custom/company/invites/:inviteId/close', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canCompanyPanel(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const inv = await TopicInviteCode.findById(req.params.inviteId).lean();
      if (!inv) return res.status(404).json({ ok: false, message: 'Topilmadi' });
      if (adm.role === 'company' && String(inv.company) !== String(adm.id)) {
        return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });
      }

      const closed = await closeInviteById(req.params.inviteId);
      return res.json({ ok: true, invite: closed, message: 'Test tugatildi (arxiv)' });
    } catch (e) {
      return res.status(400).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });

  adminRouter.post('/custom/company/invites/multi', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canCompanyPanel(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const companyId = companyIdFromAdmin(adm, req.body);
      const { invite, plan } = await createMultiTopicInvite(companyId, req.body?.segments);
      return res.json({
        ok: true,
        code: invite.code,
        inviteId: String(invite._id),
        plan,
        message: `Kod: ${invite.code}`,
      });
    } catch (e) {
      return res.status(400).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });

  adminRouter.post('/custom/company/topics/:topicId/new-invite', async (req, res) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Kirish kerak' });
      if (!canCompanyPanel(adm)) return res.status(403).json({ ok: false, message: 'Ruxsat yo‘q' });

      const companyId = companyIdFromAdmin(adm, req.body);
      const created = await createInviteForTopic(req.params.topicId, companyId);
      return res.json({
        ok: true,
        invite: { id: String(created._id), code: created.code },
        message: `Yangi kod: ${created.code}`,
      });
    } catch (e) {
      return res.status(400).json({ ok: false, message: e?.message || 'Xatolik' });
    }
  });
}
