import crypto from 'crypto';
import { TopicInviteCode } from '../models/TopicInviteCode.js';
import { Topic } from '../models/Topic.js';
import { Subject } from '../models/Subject.js';
import { TestSession } from '../models/TestSession.js';
import { User } from '../models/User.js';

function isMongoOutOfDisk(error) {
  return error?.code === 14031 || error?.codeName === 'OutOfDiskSpace';
}

/** Eski `topic` unique indeksini olib tashlab, faqat ochiq test uchun partial unique qo‘yiladi */
export async function ensureTopicInviteIndexes() {
  try {
    const indexes = await TopicInviteCode.collection.indexes();
    for (const idx of indexes) {
      if (idx.unique && idx.key?.topic === 1 && !idx.partialFilterExpression) {
        await TopicInviteCode.collection.dropIndex(idx.name);
      }
    }
  } catch (e) {
    if (isMongoOutOfDisk(e)) throw e;
    /* indeks yo‘q */
  }
  try {
    await TopicInviteCode.collection.dropIndex('topic_1');
  } catch (e) {
    if (isMongoOutOfDisk(e)) throw e;
    /* */
  }
  try {
    await TopicInviteCode.syncIndexes();
  } catch (e) {
    if (isMongoOutOfDisk(e)) {
      console.error(
        '[MongoDB] Disk to‘lgan (OutOfDiskSpace) — indekslar yangilanmadi. Atlas’da joy bo‘shating yoki cluster’ni kattalashtiring.'
      );
      return;
    }
    throw e;
  }
}

export async function generateUniqueInviteCode(excludeTopicId = null) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const row = await TopicInviteCode.findOne({ code: candidate }).lean();
    if (!row || (excludeTopicId && String(row.topic) === String(excludeTopicId))) {
      return candidate;
    }
  }
  throw new Error('Kod yaratilmadi — qayta urinib ko‘ring');
}

/** Mavzu bo‘yicha hozir ochiq (mobil ishlaydigan) kod */
export async function findActiveInviteForTopic(topicId) {
  if (!topicId) return null;
  return TopicInviteCode.findOne({ topic: topicId, closedAt: null }).lean();
}

export function inviteStatusLabel(invite) {
  if (!invite) return '—';
  return invite.closedAt ? 'Tugatilgan' : 'Davom etmoqda';
}

export async function resolveTopicCompanyOwner(topicId) {
  const topic = await Topic.findById(topicId).select('companyOwner subject').lean();
  if (!topic) return { topic: null, companyOwner: null };
  let companyOwner = topic.companyOwner;
  if (!companyOwner && topic.subject) {
    const sub = await Subject.findById(topic.subject).select('companyOwner').lean();
    companyOwner = sub?.companyOwner || null;
    if (companyOwner) {
      await Topic.updateOne({ _id: topicId }, { $set: { companyOwner } });
    }
  }
  return { topic, companyOwner };
}

/** Yangi raund: faqat oldingi kod yopilgan bo‘lsa yoki umuman kod bo‘lmasa */
export async function createInviteForTopic(topicId, companyId) {
  const active = await findActiveInviteForTopic(topicId);
  if (active) {
    throw new Error(
      'Bu mavzu uchun test hali ochiq. Avval «Testni tugatish» bilan yoping, keyin yangi kod yarating.'
    );
  }

  const { topic, companyOwner } = await resolveTopicCompanyOwner(topicId);
  if (!topic) throw new Error('Mavzu topilmadi');
  if (!companyOwner) {
    throw new Error('Faqat maxfiy (kompaniya) mavzusi uchun kirish kodi yaratiladi.');
  }

  const cid = companyId ? String(companyId) : String(companyOwner);
  const code = await generateUniqueInviteCode();

  return TopicInviteCode.create({
    topic: topicId,
    company: cid,
    code,
    closedAt: null,
    segments: [{ topic: topicId, pickCount: null, order: 0 }],
  });
}

export async function closeInviteById(inviteId) {
  const rec = await TopicInviteCode.findById(inviteId).lean();
  if (!rec) throw new Error('Yozuv topilmadi');
  if (rec.closedAt) throw new Error('Bu test allaqachon tugatilgan');
  await TopicInviteCode.updateOne({ _id: inviteId }, { $set: { closedAt: new Date() } });
  return TopicInviteCode.findById(inviteId).lean();
}

function mapQuestionForMonitoring(q, index) {
  const selected = q?.selectedAnswer || null;
  let answerStatus = 'unanswered';
  if (selected) {
    if (q.isCorrect === true) answerStatus = 'correct';
    else if (q.isCorrect === false) answerStatus = 'wrong';
    else answerStatus = 'answered';
  }

  return {
    index: index + 1,
    questionId: q?.questionId ? String(q.questionId) : '',
    prompt: q?.prompt || '',
    options: Array.isArray(q?.options) ? q.options : [],
    selectedAnswer: selected,
    correctAnswer: q?.correctAnswer || null,
    isCorrect: q?.isCorrect ?? null,
    answerStatus,
    segmentIndex: q?.segmentIndex ?? 0,
    topicId: q?.topicId ? String(q.topicId) : null,
  };
}

function formatDuration(seconds) {
  const sec = Math.max(0, Number(seconds) || 0);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function mapSessionToParticipantRow(s, invite) {
  const u = s.user;
  const code = String(invite?.code || '');
  const companyId = String(invite?.company?._id || invite?.company || '');
  const companyName =
    invite?.company?.name || invite?.company?.email || invite?.companyName || '—';
  const topicName = invite?.topic?.name || invite?.topicName || '—';
  const total = Math.max(0, Number(s.total) || (Array.isArray(s.questions) ? s.questions.length : 0));
  const questions = Array.isArray(s.questions) ? s.questions.map(mapQuestionForMonitoring) : [];
  const answered = questions.filter((q) => q.selectedAnswer).length;
  const progressPercent = total > 0 ? Math.round((answered / total) * 1000) / 10 : 0;
  const correctPercent =
    s.status === 'finished' && total > 0 ? Math.round((s.score / total) * 1000) / 10 : null;

  const fn = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
  const displayName = fn || u?.name || '—';

  const blocked = companyId
    ? (u?.companyBlocks || []).some((b) => String(b.company) === companyId)
    : false;

  const violations = Number(s.companyTabViolationCount) || 0;
  const currentIndex = Math.max(0, Number(s.currentIndex) || 0);
  const durationSeconds =
    Number(s.durationSeconds) ||
    (s.startedAt && s.finishedAt
      ? Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 1000)
      : s.startedAt
        ? Math.round((Date.now() - new Date(s.startedAt)) / 1000)
        : 0);

  return {
    userId: u?._id ? String(u._id) : '',
    name: displayName,
    email: u?.email || '—',
    phone: u?.phone || '—',
    sessionId: s._id ? String(s._id) : '',
    status: s.status,
    progressPercent,
    answeredCount: answered,
    score: s.score ?? 0,
    total,
    correctPercent,
    correctCount: s.correctCount ?? questions.filter((q) => q.isCorrect === true).length,
    wrongCount: s.wrongCount ?? questions.filter((q) => q.isCorrect === false).length,
    unansweredCount: s.unansweredCount ?? questions.filter((q) => !q.selectedAnswer).length,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt || null,
    updatedAt: s.updatedAt || null,
    expiresAt: s.expiresAt || null,
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    accessCode: s.accessCode || code,
    inviteCode: code,
    companyId,
    companyName,
    topicName,
    tabViolations: violations,
    cheatingSuspected: violations > 0,
    isBlocked: blocked,
    isActive: u?.isActive !== false,
    currentIndex,
    currentQuestionNumber: total > 0 ? Math.min(currentIndex + 1, total) : 0,
    sessionType: s.sessionType || 'standard',
    segments: Array.isArray(s.segments) ? s.segments : [],
    questions,
    questionCells: questions.map((q) => ({
      index: q.index,
      status: q.answerStatus,
      selected: q.selectedAnswer,
      correct: q.correctAnswer,
    })),
  };
}

/** Ishtirokchilar — faqat shu kod (raund) bo‘yicha sessiyalar + barcha savol/javoblar */
export async function buildParticipantRowsForInvite(invite) {
  if (!invite?.topic && !invite?._id) return [];

  const topicId = String(invite.topic?._id || invite.topic || '');
  const code = String(invite.code || '');

  const filter = invite._id
    ? {
        $or: [
          { inviteId: invite._id },
          { accessCode: code, topic: topicId, inviteId: { $in: [null, undefined] } },
          { accessCode: code, topic: topicId, inviteId: { $exists: false } },
        ],
      }
    : { accessCode: code, ...(topicId ? { topic: topicId } : {}) };

  const sessions = await TestSession.find(filter)
    .populate('user', 'name email phone firstName lastName isActive companyBlocks')
    .sort({ updatedAt: -1 })
    .lean();

  const byUser = new Map();
  for (const s of sessions) {
    const uid = String(s.user?._id || s.user || '');
    if (!uid) continue;
    const prev = byUser.get(uid);
    if (!prev || new Date(s.updatedAt) > new Date(prev.updatedAt)) {
      byUser.set(uid, s);
    }
  }

  const rows = [...byUser.values()].map((s) => mapSessionToParticipantRow(s, invite));

  rows.sort((a, b) => {
    if (a.tabViolations !== b.tabViolations) return b.tabViolations - a.tabViolations;
    const ap = a.status === 'in_progress' ? 0 : 1;
    const bp = b.status === 'in_progress' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return new Date(b.finishedAt || b.startedAt).getTime() - new Date(a.finishedAt || a.startedAt).getTime();
  });

  return rows;
}

function toSummaryRow(row) {
  return {
    sessionId: String(row.sessionId),
    userId: String(row.userId),
    name: row.name,
    email: row.email,
    status: row.status,
    progressPercent: row.progressPercent,
    answeredCount: row.answeredCount,
    total: row.total,
    correctPercent: row.correctPercent,
    score: row.score,
    tabViolations: row.tabViolations,
    cheatingSuspected: row.cheatingSuspected,
    isBlocked: row.isBlocked,
    topicName: row.topicName,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

/** Monitoring: barcha foydalanuvchilar (kod tanlashsiz), oxirgi urinish */
export async function listMonitoringParticipants(companyId, { search = '' } = {}) {
  const inviteFilter = companyId ? { company: companyId } : {};
  const invites = await TopicInviteCode.find(inviteFilter)
    .populate('topic', 'name')
    .populate('company', 'name email')
    .lean();

  if (!invites.length) return [];

  const inviteById = new Map(invites.map((i) => [String(i._id), i]));
  const codes = [...new Set(invites.map((i) => i.code).filter(Boolean))];
  const inviteIds = invites.map((i) => i._id);

  const orClause = [{ inviteId: { $in: inviteIds } }];
  if (codes.length) {
    orClause.push({
      accessCode: { $in: codes },
      $or: [{ inviteId: null }, { inviteId: { $exists: false } }],
    });
  }

  const sessions = await TestSession.find({ $or: orClause })
    .populate('user', 'name email phone firstName lastName isActive companyBlocks')
    .sort({ updatedAt: -1 })
    .lean();

  const byUser = new Map();
  for (const s of sessions) {
    const uid = String(s.user?._id || s.user || '');
    if (!uid) continue;
    const prev = byUser.get(uid);
    if (!prev || new Date(s.updatedAt) > new Date(prev.updatedAt)) {
      byUser.set(uid, s);
    }
  }

  let rows = [];
  for (const s of byUser.values()) {
    const invId = s.inviteId ? String(s.inviteId) : null;
    let invite = invId ? inviteById.get(invId) : null;
    if (!invite && s.accessCode) {
      invite = invites.find((i) => i.code === s.accessCode) || null;
    }
    if (!invite) continue;
    rows.push(toSummaryRow(mapSessionToParticipantRow(s, invite)));
  }

  const q = String(search || '')
    .trim()
    .toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        String(r.name || '')
          .toLowerCase()
          .includes(q) ||
        String(r.email || '')
          .toLowerCase()
          .includes(q)
    );
  }

  rows.sort((a, b) => {
    if (a.cheatingSuspected !== b.cheatingSuspected) return b.cheatingSuspected - a.cheatingSuspected;
    const ap = a.status === 'in_progress' ? 0 : 1;
    const bp = b.status === 'in_progress' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime();
  });

  return rows;
}

/** Bitta foydalanuvchi testi — to‘liq savollar/javoblar */
export async function getParticipantMonitoringDetail(sessionId, companyId) {
  const s = await TestSession.findById(sessionId)
    .populate('user', 'name email phone firstName lastName isActive companyBlocks')
    .lean();
  if (!s) return null;

  let invite = null;
  if (s.inviteId) {
    invite = await TopicInviteCode.findById(s.inviteId)
      .populate('topic', 'name')
      .populate('company', 'name email')
      .lean();
  } else if (s.accessCode) {
    invite = await TopicInviteCode.findOne({ code: String(s.accessCode) })
      .populate('topic', 'name')
      .populate('company', 'name email')
      .lean();
  }

  if (!invite) return null;
  if (companyId && String(invite.company?._id || invite.company) !== String(companyId)) {
    return null;
  }

  return { participant: mapSessionToParticipantRow(s, invite) };
}

/** Monitoring sahifasi: testlar ro‘yxati */
export async function listInvitesForMonitoring(companyId, { limit = 100 } = {}) {
  const filter = companyId ? { company: companyId } : {};
  const items = await TopicInviteCode.find(filter)
    .populate('topic', 'name')
    .populate('company', 'name email')
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, limit)))
    .lean();

  return items.map((inv) => {
    const segCount = Array.isArray(inv.segments) ? inv.segments.length : 0;
    return {
      id: String(inv._id),
      code: inv.code,
      topicId: String(inv.topic?._id || inv.topic || ''),
      topicName: inv.topic?.name || '—',
      companyId: String(inv.company?._id || inv.company || ''),
      companyName: inv.company?.name || inv.company?.email || '—',
      multiTopic: segCount > 1,
      segmentCount: segCount || 1,
      status: inviteStatusLabel(inv),
      isActive: !inv.closedAt,
      closedAt: inv.closedAt || null,
      createdAt: inv.createdAt,
    };
  });
}

/** Bitta test bo‘yicha to‘liq monitoring */
export async function getInviteMonitoringDetail(inviteId) {
  const inv = await TopicInviteCode.findById(inviteId)
    .populate('topic', 'name')
    .populate('company', 'name email')
    .lean();
  if (!inv) return null;

  const participants = await buildParticipantRowsForInvite(inv);
  const segCount = Array.isArray(inv.segments) ? inv.segments.length : 0;

  return {
    invite: {
      id: String(inv._id),
      code: inv.code,
      topicId: String(inv.topic?._id || inv.topic || ''),
      topicName: inv.topic?.name || '—',
      companyId: String(inv.company?._id || inv.company || ''),
      companyName: inv.company?.name || inv.company?.email || '—',
      multiTopic: segCount > 1,
      segmentCount: segCount || 1,
      status: inviteStatusLabel(inv),
      closedAt: inv.closedAt || null,
      segments: inv.segments || [],
    },
    participants,
    stats: {
      total: participants.length,
      inProgress: participants.filter((p) => p.status === 'in_progress').length,
      finished: participants.filter((p) => p.status === 'finished').length,
      cheating: participants.filter((p) => p.cheatingSuspected).length,
      blocked: participants.filter((p) => p.isBlocked).length,
    },
  };
}

export async function listInvitesForCompany(companyId, { page = 1, limit = 50 } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  const filter = { company: companyId };
  const [total, items] = await Promise.all([
    TopicInviteCode.countDocuments(filter),
    TopicInviteCode.find(filter)
      .populate('topic', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    items: items.map((inv) => {
      const segCount = Array.isArray(inv.segments) ? inv.segments.length : 0;
      return {
        id: String(inv._id),
        code: inv.code,
        topicId: String(inv.topic?._id || inv.topic),
        topicName: inv.topic?.name || '—',
        multiTopic: segCount > 1,
        segmentCount: segCount || 1,
        status: inviteStatusLabel(inv),
        isActive: !inv.closedAt,
        closedAt: inv.closedAt || null,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      };
    }),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
