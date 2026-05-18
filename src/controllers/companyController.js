import StatusCodes from 'http-status-codes';
import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';
import { asyncHandler } from '../utils/validators.js';
import { TopicInviteCode } from '../models/TopicInviteCode.js';
import { Notification } from '../models/Notification.js';
import {
  buildParticipantRowsForInvite,
  closeInviteById,
  createInviteForTopic,
  inviteStatusLabel,
  listInvitesForCompany,
} from '../services/companyInviteService.js';
import { buildInvitePlanMeta, createMultiTopicInvite } from '../services/companyMultiTestService.js';
import { blockUserForCompany, unblockUserForCompany } from '../services/companyBlockService.js';

function companyIdFromReq(req) {
  if (req.user.role === 'company') return String(req.user._id);
  const q = String(req.query.companyId || req.body?.companyId || '').trim();
  if (req.user.role === 'admin' && mongoose.isValidObjectId(q)) return q;
  return String(req.user._id);
}

async function assertOwnInvite(inviteId, companyId) {
  const inv = await TopicInviteCode.findById(inviteId).lean();
  if (!inv) throw new AppError('Kod topilmadi', StatusCodes.NOT_FOUND);
  if (String(inv.company) !== String(companyId)) {
    throw new AppError('Ruxsat yo‘q', StatusCodes.FORBIDDEN);
  }
  return inv;
}

/** GET /api/company/invites */
export const listCompanyInvites = asyncHandler(async (req, res) => {
  const companyId = companyIdFromReq(req);
  const page = Number(req.query.page) || 1;
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const data = await listInvitesForCompany(companyId, { page, limit });
  res.status(StatusCodes.OK).json({ success: true, data });
});

/** GET /api/company/invites/:inviteId */
export const getCompanyInvite = asyncHandler(async (req, res, next) => {
  const companyId = companyIdFromReq(req);
  const inv = await assertOwnInvite(req.params.inviteId, companyId);
  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      id: String(inv._id),
      code: inv.code,
      topicId: String(inv.topic),
      status: inviteStatusLabel(inv),
      isActive: !inv.closedAt,
      closedAt: inv.closedAt || null,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    },
  });
});

/** GET /api/company/invites/:inviteId/participants */
export const listInviteParticipants = asyncHandler(async (req, res) => {
  const companyId = companyIdFromReq(req);
  const inv = await assertOwnInvite(req.params.inviteId, companyId);
  const rows = await buildParticipantRowsForInvite(inv);
  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      invite: {
        id: String(inv._id),
        code: inv.code,
        status: inviteStatusLabel(inv),
        closedAt: inv.closedAt || null,
      },
      participants: rows,
    },
  });
});

/** POST /api/company/invites/:inviteId/close */
export const closeCompanyInvite = asyncHandler(async (req, res) => {
  const companyId = companyIdFromReq(req);
  await assertOwnInvite(req.params.inviteId, companyId);
  const closed = await closeInviteById(req.params.inviteId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Test tugatildi — arxivlandi, ishtirokchilar ma’lumoti saqlanadi.',
    data: {
      id: String(closed._id),
      status: inviteStatusLabel(closed),
      closedAt: closed.closedAt,
    },
  });
});

/** POST /api/company/invites/multi — ko‘p mavzu + har birida random savollar soni */
export const createMultiTopicCompanyInvite = asyncHandler(async (req, res) => {
  const companyId = companyIdFromReq(req);
  const segments = req.body?.segments;
  const { invite, plan } = await createMultiTopicInvite(companyId, segments);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: `Kirish kodi: ${invite.code}`,
    data: {
      id: String(invite._id),
      code: invite.code,
      status: inviteStatusLabel(invite),
      ...plan,
    },
  });
});

/** GET /api/company/invites/:inviteId/plan — yaratishdan oldin / keyin reja */
export const getInvitePlan = asyncHandler(async (req, res) => {
  const companyId = companyIdFromReq(req);
  const inv = await assertOwnInvite(req.params.inviteId, companyId);
  const plan = await buildInvitePlanMeta(inv);
  res.status(StatusCodes.OK).json({ success: true, data: plan });
});

/** POST /api/company/topics/:topicId/invites — yangi raund (yangi kod) */
export const createCompanyInviteForTopic = asyncHandler(async (req, res) => {
  const companyId = companyIdFromReq(req);
  const created = await createInviteForTopic(req.params.topicId, companyId);
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: `Yangi kirish kodi: ${created.code}`,
    data: {
      id: String(created._id),
      code: created.code,
      topicId: String(created.topic),
      status: inviteStatusLabel(created),
    },
  });
});

/** POST /api/company/participants/:userId/block */
export const blockParticipant = asyncHandler(async (req, res) => {
  const companyId = companyIdFromReq(req);
  const reason = String(req.body?.reason || '').trim();
  await blockUserForCompany(req.params.userId, companyId, reason);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Foydalanuvchi kompaniya testlaridan bloklandi',
  });
});

/** POST /api/company/participants/:userId/unblock */
export const unblockParticipant = asyncHandler(async (req, res) => {
  const companyId = companyIdFromReq(req);
  await unblockUserForCompany(req.params.userId, companyId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Blok olib tashlandi',
  });
});

/** GET /api/company/notifications — qoida buzilishlar */
export const listCompanyAlerts = asyncHandler(async (req, res) => {
  const companyId = companyIdFromReq(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const skip = (page - 1) * limit;
  const filter = { user: companyId, type: 'company_test_alert' };

  const [total, items] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    },
  });
});
