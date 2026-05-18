import crypto from 'crypto';
import mongoose from 'mongoose';
import { TopicInviteCode } from '../models/TopicInviteCode.js';
import { Topic } from '../models/Topic.js';
import { Subject } from '../models/Subject.js';
import { Question } from '../models/Question.js';
import { TestSession } from '../models/TestSession.js';
import { generateUniqueInviteCode, resolveTopicCompanyOwner } from './companyInviteService.js';

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Invite dan segmentlar (eski: bitta `topic`) */
export function getInviteSegments(invite) {
  if (!invite) return [];
  if (Array.isArray(invite.segments) && invite.segments.length > 0) {
    return [...invite.segments]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => ({
        topicId: String(s.topic?._id || s.topic),
        pickCount: s.pickCount != null && s.pickCount > 0 ? Math.floor(s.pickCount) : null,
      }));
  }
  if (invite.topic) {
    return [{ topicId: String(invite.topic?._id || invite.topic), pickCount: null }];
  }
  return [];
}

export function isMultiTopicInvite(invite) {
  return getInviteSegments(invite).length > 1;
}

export async function validateSegmentsForCompany(segmentsInput, companyId) {
  if (!Array.isArray(segmentsInput) || segmentsInput.length === 0) {
    throw new Error('Kamida bitta mavzu tanlang');
  }
  if (segmentsInput.length > 20) {
    throw new Error('Bir kodda maksimum 20 ta mavzu');
  }

  const normalized = [];
  const seenTopics = new Set();

  for (let i = 0; i < segmentsInput.length; i++) {
    const raw = segmentsInput[i] || {};
    const topicId = String(raw.topicId || raw.topic || '').trim();
    if (!topicId) throw new Error(`${i + 1}-mavzu: topicId kerak`);

    if (seenTopics.has(topicId)) {
      throw new Error('Bir xil mavzuni ikki marta qo‘shib bo‘lmaydi');
    }
    seenTopics.add(topicId);

    const { topic, companyOwner } = await resolveTopicCompanyOwner(topicId);
    if (!topic) throw new Error(`Mavzu topilmadi: ${topicId}`);
    if (!companyOwner) throw new Error(`«${topic.name}» jamoat mavzusi — faqat kompaniya mavzulari`);
    if (String(companyOwner) !== String(companyId)) {
      throw new Error(`«${topic.name}» sizning kompaniyangizga tegishli emas`);
    }

    const pool = await Question.countDocuments({ topic: topicId });
    if (!pool) throw new Error(`«${topic.name}» da savollar yo‘q`);

    let pickCount = null;
    if (raw.pickCount != null && raw.pickCount !== '') {
      pickCount = Math.floor(Number(raw.pickCount));
      if (!Number.isFinite(pickCount) || pickCount < 1) {
        throw new Error(`«${topic.name}»: pickCount musbat son bo‘lishi kerak`);
      }
      if (pickCount > pool) {
        throw new Error(`«${topic.name}»: bazada ${pool} ta savol, ${pickCount} ta tanlab bo‘lmaydi`);
      }
    }

    const sub = await Subject.findById(topic.subject).select('name').lean();

    normalized.push({
      topicId,
      pickCount,
      order: i,
      topicName: topic.name,
      subjectId: String(topic.subject),
      subjectName: sub?.name || '',
      poolCount: pool,
      minutes: topic.minutes,
      difficulty: topic.difficulty,
    });
  }

  return normalized;
}

/** Preview / start uchun segmentlar meta */
export async function buildInvitePlanMeta(invite) {
  const defs = getInviteSegments(invite);
  const segments = [];
  let totalQuestions = 0;
  let totalMinutes = 0;

  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    const topic = await Topic.findById(d.topicId).lean();
    if (!topic) continue;
    const sub = await Subject.findById(topic.subject).select('name description companyOwner').lean();
    const pool = await Question.countDocuments({ topic: d.topicId });
    const inTest = d.pickCount != null ? d.pickCount : pool;

    totalQuestions += inTest;
    totalMinutes += Number(topic.minutes) || 0;

    segments.push({
      order: i,
      segmentIndex: i,
      topic: {
        _id: topic._id,
        name: topic.name,
        description: topic.description || '',
        minutes: topic.minutes,
        difficulty: topic.difficulty,
      },
      subject: sub
        ? { _id: sub._id, name: sub.name, description: sub.description || '' }
        : null,
      questionsInPool: pool,
      questionsInTest: inTest,
      pickCount: d.pickCount,
      randomPick: d.pickCount != null && d.pickCount < pool,
    });
  }

  return {
    multiTopic: segments.length > 1,
    segmentCount: segments.length,
    totalQuestions,
    totalMinutes,
    segments,
    flowHint:
      segments.length > 1
        ? 'Avval birinchi mavzu savollari, keyin keyingi mavzuga o‘tasiz — har o‘tishda ilova ogohlantiradi.'
        : segments[0]?.pickCount != null
          ? `Mavzudan tasodifiy ${segments[0].questionsInTest} ta savol tanlanadi.`
          : 'Barcha savollar ketma-ket beriladi.',
  };
}

async function pickQuestionsForTopic(topicId, pickCount) {
  const all = await Question.find({ topic: topicId }).sort({ createdAt: 1 }).lean();
  if (!all.length) return [];
  const shuffled = shuffle(all);
  const n = pickCount != null ? Math.min(pickCount, shuffled.length) : shuffled.length;
  return shuffled.slice(0, n);
}

export function mapQuestionToSession(q, segmentIndex, topicId) {
  const shuffledOptions = shuffle([q.correctAnswer, q.wrongAnswer1, q.wrongAnswer2, q.wrongAnswer3]);
  return {
    questionId: q._id,
    prompt: q.question,
    options: shuffledOptions,
    correctAnswer: q.correctAnswer,
    segmentIndex,
    topicId,
  };
}

/** Sessiya uchun savollar + segment chegaralari */
export async function buildSessionFromInvite(invite) {
  const defs = getInviteSegments(invite);
  const sessionQuestions = [];
  const sessionSegments = [];
  let index = 0;
  let totalMinutes = 0;

  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    const topic = await Topic.findById(d.topicId).lean();
    if (!topic) throw new Error('Mavzu topilmadi');

    const sub = await Subject.findById(topic.subject).select('name').lean();
    const picked = await pickQuestionsForTopic(d.topicId, d.pickCount);
    if (!picked.length) throw new Error(`«${topic.name}» uchun savol topilmadi`);

    const startIndex = index;
    for (const q of picked) {
      sessionQuestions.push(mapQuestionToSession(q, i, d.topicId));
      index += 1;
    }

    sessionSegments.push({
      segmentIndex: i,
      topic: d.topicId,
      topicName: topic.name,
      subject: topic.subject,
      subjectName: sub?.name || '',
      startIndex,
      endIndex: index - 1,
      questionCount: picked.length,
      minutes: topic.minutes || 0,
    });

    totalMinutes += Number(topic.minutes) || 0;
  }

  return {
    sessionQuestions,
    sessionSegments,
    totalMinutes,
    primaryTopicId: defs[0].topicId,
    multiTopic: defs.length > 1,
  };
}

export function getSegmentAtIndex(session, questionIndex) {
  const segs = session.segments || [];
  if (!segs.length) return null;
  return (
    segs.find((s) => questionIndex >= s.startIndex && questionIndex <= s.endIndex) || segs[0]
  );
}

export function buildSegmentContext(session, questionIndex) {
  const seg = getSegmentAtIndex(session, questionIndex);
  if (!seg) {
    return {
      segmentIndex: 0,
      segmentTotal: 1,
      questionInSegment: questionIndex + 1,
      questionsInSegment: session.total,
    };
  }

  const segIdx = seg.segmentIndex ?? 0;
  const nextSeg = (session.segments || []).find((s) => s.segmentIndex === segIdx + 1);

  return {
    segmentIndex: segIdx,
    segmentTotal: (session.segments || []).length || 1,
    topic: {
      _id: seg.topic,
      name: seg.topicName,
    },
    subject: seg.subject
      ? { _id: seg.subject, name: seg.subjectName }
      : null,
    questionInSegment: questionIndex - seg.startIndex + 1,
    questionsInSegment: seg.questionCount,
    isFirstQuestionInSegment: questionIndex === seg.startIndex,
    isLastQuestionInSegment: questionIndex === seg.endIndex,
    hasNextSegment: Boolean(nextSeg),
    nextSegmentPreview: nextSeg
      ? {
          segmentIndex: nextSeg.segmentIndex,
          topicName: nextSeg.topicName,
          subjectName: nextSeg.subjectName,
          questionCount: nextSeg.questionCount,
        }
      : null,
  };
}

/** Mavzu o‘zgarishi: oldingi segment oxirgi savoli javoblanganidan keyin */
export function buildSegmentTransition(session, previousIndex, newIndex) {
  if (!session.segments?.length || newIndex <= previousIndex) return null;

  const prevSeg = getSegmentAtIndex(session, previousIndex);
  const newSeg = getSegmentAtIndex(session, newIndex);
  if (!prevSeg || !newSeg || prevSeg.segmentIndex === newSeg.segmentIndex) return null;

  return {
    type: 'topic_change',
    title: 'Keyingi mavzu',
    message: `«${prevSeg.topicName}» bo‘limi tugadi. Endi «${newSeg.topicName}» (${newSeg.subjectName}) — ${newSeg.questionCount} ta savol.`,
    completedSegment: {
      segmentIndex: prevSeg.segmentIndex,
      topicName: prevSeg.topicName,
      subjectName: prevSeg.subjectName,
      questionCount: prevSeg.questionCount,
    },
    nextSegment: {
      segmentIndex: newSeg.segmentIndex,
      topicId: String(newSeg.topic),
      topicName: newSeg.topicName,
      subjectId: String(newSeg.subject),
      subjectName: newSeg.subjectName,
      questionCount: newSeg.questionCount,
      firstQuestionIndex: newSeg.startIndex,
    },
    /** Ilova modal ko‘rsatguncha `true` */
    showWarning: true,
  };
}

export function serializeSessionPlan(session) {
  return {
    sessionType: session.sessionType || 'standard',
    multiTopic: session.sessionType === 'company_multi',
    totalQuestions: session.total,
    currentIndex: session.currentIndex,
    segmentCount: session.segments?.length || 0,
    segments: (session.segments || []).map((s) => ({
      segmentIndex: s.segmentIndex,
      topicId: String(s.topic),
      topicName: s.topicName,
      subjectName: s.subjectName,
      startIndex: s.startIndex,
      endIndex: s.endIndex,
      questionCount: s.questionCount,
    })),
    currentSegment: buildSegmentContext(session, session.currentIndex),
  };
}

export async function createCompanyCodeSession(userId, invite) {
  const code = String(invite.code || '').trim();
  const segments = getInviteSegments(invite);
  const multi = segments.length > 1 || segments.some((s) => s.pickCount != null);

  const finished = await TestSession.findOne({
    user: userId,
    accessCode: code,
    status: 'finished',
    ...(invite._id ? { inviteId: invite._id } : {}),
  }).lean();

  if (finished) {
    const err = new Error(
      'Siz ushbu kirish kodi bilan bu testni allaqachon yakunlagansiz. Kompaniya yangi kod bersa, qayta urinib ko‘ring.'
    );
    err.statusCode = 403;
    throw err;
  }

  let active = await TestSession.findOne({
    user: userId,
    accessCode: code,
    status: 'in_progress',
  });

  if (active) {
    if (
      active.status === 'in_progress' &&
      active.expiresAt &&
      Date.now() >= new Date(active.expiresAt).getTime()
    ) {
      active.status = 'finished';
      active.finishedAt = new Date();
      await active.save();
    } else if (active.status === 'in_progress') {
      const topic = await Topic.findById(active.topic).lean();
      return { session: active, topic, resumed: true };
    }
  }

  const built = await buildSessionFromInvite(invite);
  const startedAt = new Date();
  const durationSeconds = Math.max(0, built.totalMinutes) * 60;
  const expiresAt = durationSeconds ? new Date(startedAt.getTime() + durationSeconds * 1000) : null;

  const session = await TestSession.create({
    user: userId,
    topic: built.primaryTopicId,
    status: 'in_progress',
    currentIndex: 0,
    score: 0,
    total: built.sessionQuestions.length,
    questions: built.sessionQuestions,
    startedAt,
    durationSeconds,
    expiresAt,
    accessCode: code,
    inviteId: invite._id,
    sessionType: multi || built.sessionSegments.length > 1 ? 'company_multi' : 'standard',
    segments: built.sessionSegments,
    currentSegmentIndex: 0,
  });

  const topic = await Topic.findById(built.primaryTopicId).lean();
  return { session, topic, resumed: false, plan: built };
}

/** Pin faqat shu sabablarda o‘chiriladi (mobil AsyncStorage) */
export const RESUME_PIN_CLEAR_REASONS = [
  'already_finished',
  'blocked_by_company',
  'test_closed',
  'session_expired',
];

export function shouldClearResumePin(reason) {
  return RESUME_PIN_CLEAR_REASONS.includes(reason);
}

export function resumePinPolicyPayload() {
  return {
    clearResumePinWhen: [...RESUME_PIN_CLEAR_REASONS],
    persistPinWhen: ['no_active_session', 'invite_not_found'],
  };
}

export function buildResumeDenied(reason, message = '') {
  return {
    canResume: false,
    reason,
    clearResumePin: shouldClearResumePin(reason),
    message,
    pinPolicy: resumePinPolicyPayload(),
  };
}

/** Sessiya bo‘yicha invite (kod o‘zgarganda ham inviteId ishlaydi) */
export async function resolveInviteForSession(session) {
  const code = String(session?.accessCode || '').trim();
  if (/^\d{6}$/.test(code)) {
    const byCode = await TopicInviteCode.findOne({ code }).lean();
    if (byCode) return byCode;
  }
  if (session?.inviteId) {
    return TopicInviteCode.findById(session.inviteId).lean();
  }
  return null;
}

/**
 * Ochiq kompaniya test sessiyasi.
 * @param {string} userId
 * @param {string} [preferredSessionId] — ilova pin saqlagan sessionId (refresh uchun)
 */
export async function findActiveCompanyCodeSession(userId, preferredSessionId = null) {
  const uid = String(userId);

  if (preferredSessionId && mongoose.isValidObjectId(preferredSessionId)) {
    const pinned = await TestSession.findOne({
      _id: preferredSessionId,
      user: uid,
      status: 'in_progress',
    }).lean();
    if (pinned) return pinned;
  }

  const byCode = await TestSession.findOne({
    user: uid,
    status: 'in_progress',
    accessCode: { $regex: /^[0-9]{6}$/ },
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (byCode) return byCode;

  const byInvite = await TestSession.findOne({
    user: uid,
    status: 'in_progress',
    inviteId: { $exists: true, $ne: null },
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (byInvite) return byInvite;

  const anyOpen = await TestSession.findOne({
    user: uid,
    status: 'in_progress',
    $or: [{ accessCode: { $ne: null } }, { inviteId: { $ne: null } }],
  })
    .sort({ updatedAt: -1 })
    .lean();

  return anyOpen;
}

export async function createMultiTopicInvite(companyId, segmentsInput) {
  const normalized = await validateSegmentsForCompany(segmentsInput, companyId);
  const code = await generateUniqueInviteCode();

  const doc = await TopicInviteCode.create({
    topic: normalized[0].topicId,
    company: companyId,
    code,
    closedAt: null,
    segments: normalized.map((s) => ({
      topic: s.topicId,
      pickCount: s.pickCount,
      order: s.order,
    })),
  });

  const plan = await buildInvitePlanMeta(doc.toObject ? doc.toObject() : doc);
  return { invite: doc, plan };
}
