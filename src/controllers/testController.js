import StatusCodes from 'http-status-codes';
import AppError from '../utils/AppError.js';
import { asyncHandler } from '../utils/validators.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { Question } from '../models/Question.js';
import { TestSession } from '../models/TestSession.js';
import crypto from 'crypto';
import { TopicInviteCode } from '../models/TopicInviteCode.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { grantFinishRewardsIfNeeded, tryGrant80MilestoneOnce } from '../services/testRewards.js';
import { ensureUserFriendIdFresh } from '../services/friendIdService.js';
import { isUserBlockedByCompany } from '../services/companyBlockService.js';
import {
  buildInvitePlanMeta,
  buildResumeDenied,
  buildSegmentContext,
  buildSegmentTransition,
  createCompanyCodeSession,
  findActiveCompanyCodeSession,
  resolveInviteForSession,
  resumePinPolicyPayload,
  serializeSessionPlan,
} from '../services/companyMultiTestService.js';

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function publicQuestion(session, idx) {
  const q = session.questions[idx];
  if (!q) return null;
  const labels = ['A', 'B', 'C', 'D'];
  const choices = (q.options || []).slice(0, 4).map((text, i) => ({
    key: labels[i] || String(i + 1),
    text,
  }));
  return {
    index: idx,
    questionId: q.questionId,
    question: q.prompt,
    // Preferred for UI: A/B/C/D labeled choices
    choices,
    // Backward-compat: raw options (strings)
    options: q.options,
  };
}

function letterForSelectedAnswer(q) {
  if (!q?.selectedAnswer) return null;
  const idx = (q.options || []).findIndex((t) => t === q.selectedAnswer);
  if (idx < 0) return null;
  return ['A', 'B', 'C', 'D'][idx] || null;
}

function letterForOptionText(options, text) {
  if (!text) return null;
  const idx = (options || []).findIndex((t) => t === text);
  if (idx < 0) return null;
  return ['A', 'B', 'C', 'D'][idx] || null;
}

function finalizeSessionCounts(session) {
  const correct = session.questions.filter((q) => q.isCorrect === true).length;
  const wrong = session.questions.filter((q) => q.selectedAnswer && q.isCorrect === false).length;
  const unanswered = session.questions.filter((q) => !q.selectedAnswer).length;
  session.correctCount = correct;
  session.wrongCount = wrong;
  session.unansweredCount = unanswered;
  session.score = correct;
  session.total = session.questions.length;
}

function remainingSeconds(session) {
  if (!session?.expiresAt) return null;
  const ms = session.expiresAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

/** Jamoat katalogi — kompaniya maxfiy fan/mavzulari chiqmasin */
function onlyPublicOwnerFilter() {
  return { $or: [{ companyOwner: null }, { companyOwner: { $exists: false } }] };
}

async function createTestSessionResponse(userId, topicId, accessMode, options = {}) {
  const { accessCode: accessCodeSnapshot } = options;

  const topic = await Topic.findById(topicId).lean();
  if (!topic) throw new AppError('Topic not found', StatusCodes.NOT_FOUND);

  const sub = await Subject.findById(topic.subject).select('companyOwner').lean();
  const isPrivate = Boolean(sub?.companyOwner);

  if (accessMode === 'public' && isPrivate) {
    throw new AppError(
      'This test is only available with a 6-digit access code from your organization',
      StatusCodes.FORBIDDEN
    );
  }
  if (accessMode === 'code' && !isPrivate) {
    throw new AppError('This access code is not valid', StatusCodes.BAD_REQUEST);
  }

  if (accessMode === 'code') {
    const codeSnapshot = String(accessCodeSnapshot || '').trim();
    if (!/^\d{6}$/.test(codeSnapshot)) {
      throw new AppError('Invalid access code context', StatusCodes.BAD_REQUEST);
    }

    const finishedSameCode = await TestSession.findOne({
      user: userId,
      topic: topicId,
      status: 'finished',
      accessCode: codeSnapshot,
    }).lean();
    if (finishedSameCode) {
      throw new AppError(
        'Siz ushbu kirish kodi bilan bu testni allaqachon yakunlagansiz. Kompaniya yangi kod bersa, qayta ishlatishingiz mumkin.',
        StatusCodes.FORBIDDEN
      );
    }

    let active = await TestSession.findOne({ user: userId, topic: topicId, status: 'in_progress' });
    if (active) {
      await ensureNotExpired(active);
      active = await TestSession.findById(active._id);
      if (active && active.status === 'in_progress') {
        return { session: active, topic };
      }
    }

    const finishedAfterExpire = await TestSession.findOne({
      user: userId,
      topic: topicId,
      status: 'finished',
      accessCode: codeSnapshot,
    }).lean();
    if (finishedAfterExpire) {
      throw new AppError(
        'Siz ushbu kirish kodi bilan bu testni allaqachon yakunlagansiz. Kompaniya yangi kod bersa, qayta ishlatishingiz mumkin.',
        StatusCodes.FORBIDDEN
      );
    }
  }

  const questions = await Question.find({ topic: topicId }).sort({ createdAt: 1 }).lean();
  if (!questions.length) throw new AppError('No questions for this topic', StatusCodes.BAD_REQUEST);

  const randomizedQuestions = shuffle(questions);
  const sessionQuestions = randomizedQuestions.map((q) => {
    const shuffledOptions = shuffle([q.correctAnswer, q.wrongAnswer1, q.wrongAnswer2, q.wrongAnswer3]);
    return {
      questionId: q._id,
      prompt: q.question,
      options: shuffledOptions,
      correctAnswer: q.correctAnswer,
    };
  });

  const durationSeconds = Math.max(0, Number(topic.minutes || 0)) * 60;
  const startedAt = new Date();
  const expiresAt = durationSeconds ? new Date(startedAt.getTime() + durationSeconds * 1000) : null;

  const sessionPayload = {
    user: userId,
    topic: topicId,
    status: 'in_progress',
    currentIndex: 0,
    score: 0,
    total: sessionQuestions.length,
    questions: sessionQuestions,
    startedAt,
    durationSeconds,
    expiresAt,
  };
  if (accessMode === 'code' && accessCodeSnapshot) {
    sessionPayload.accessCode = String(accessCodeSnapshot).trim();
  }

  const session = await TestSession.create(sessionPayload);

  return { session, topic };
}

/** Kompaniya profili (nom + logo URL) — mobil uchun */
async function getCompanyPublicById(companyId) {
  if (!companyId) return null;
  const u = await User.findById(companyId).select('name companyLogo role').lean();
  if (!u || u.role !== 'company') return null;
  return {
    _id: u._id,
    name: u.name,
    companyLogo: u.companyLogo || null,
  };
}

function buildSessionStartPayload(session, topic, companyMeta = null, extras = {}) {
  const data = {
    sessionId: session._id,
    sessionType: session.sessionType || 'standard',
    multiTopic: session.sessionType === 'company_multi',
    topic: {
      _id: topic._id,
      name: topic.name,
      minutes: topic.minutes,
      difficulty: topic.difficulty,
    },
    total: session.total,
    expiresAt: session.expiresAt,
    remainingSeconds: remainingSeconds(session),
    current: publicQuestion(session, session.currentIndex || 0),
    plan: extras.testPlan || serializeSessionPlan(session),
    segment: buildSegmentContext(session, session.currentIndex || 0),
    resumed: Boolean(extras.resumed),
  };
  if (companyMeta) {
    data.company = companyMeta;
  }
  return {
    success: true,
    message: extras.resumed ? 'Test resumed' : 'Test started',
    data,
  };
}

function buildAdvice({ score, total }) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeScore = Math.max(0, Number(score || 0));
  const pct = safeTotal ? Math.round((safeScore / safeTotal) * 1000) / 10 : 0; // 1 decimal

  if (!safeTotal) {
    return { percent: 0, status: 'unknown', message: "Natija hisoblash uchun savollar topilmadi." };
  }

  if (pct === 100) {
    return {
      percent: pct,
      status: 'perfect',
      message: "Tabriklaymiz! Hammasini to‘g‘ri yechdingiz — zo‘r natija.",
    };
  }

  if (pct >= 80) {
    return {
      percent: pct,
      status: 'great',
      message: "Zo‘r! 80%+ natija. Keyingi safar albatta yanada yaxshi o‘rin olasiz.",
    };
  }

  if (pct >= 50) {
    return {
      percent: pct,
      status: 'ok',
      message: "Yaxshi harakat. Yanada mustahkamlash uchun xatolarni ko‘rib, qayta tayyorlanib chiqing.",
    };
  }

  return {
    percent: pct,
    status: 'need_practice',
    message: "Natija pastroq. Ko‘proq tayyorlanishni tavsiya qilamiz — keyingi urinishda ancha yaxshi bo‘ladi.",
  };
}

async function ensureNotExpired(session) {
  if (session.status !== 'in_progress') return;
  if (!session.expiresAt) return;
  if (Date.now() < session.expiresAt.getTime()) return;

  session.status = 'finished';
  session.finishedAt = new Date();
  finalizeSessionCounts(session);
  await session.save();

  await tryGrant80MilestoneOnce(session._id);
  await grantFinishRewardsIfNeeded(session._id);
}

export const me = asyncHandler(async (req, res, next) => {
  const fresh = await ensureUserFriendIdFresh(req.user._id);
  if (!fresh) return next(new AppError('Foydalanuvchi topilmadi', StatusCodes.NOT_FOUND));

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      /** `_id` — Mongo ID; do‘stlar uchun ko‘rsatish: `friendId` (10–16 raqam) */
      user: fresh.toJSON(),
    },
  });
});

export const listSubjects = asyncHandler(async (req, res) => {
  const qRaw = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  const pageRaw = typeof req.query?.page === 'string' ? Number(req.query.page) : Number(req.query?.page);
  const limitRaw = typeof req.query?.limit === 'string' ? Number(req.query.limit) : Number(req.query?.limit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 20;
  const skip = (page - 1) * limit;

  const filter = { $and: [onlyPublicOwnerFilter()] };
  if (qRaw) {
    const escaped = qRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$and.push({ $or: [{ name: rx }, { description: rx }] });
  }

  const [total, subjects] = await Promise.all([
    Subject.countDocuments(filter),
    Subject.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
  ]);

  const subjectIds = subjects.map((s) => s._id);
  const topicCounts = subjectIds.length
    ? await Topic.aggregate([
        {
          $match: {
            subject: { $in: subjectIds },
            $or: [{ companyOwner: null }, { companyOwner: { $exists: false } }],
          },
        },
        { $group: { _id: '$subject', count: { $sum: 1 } } },
      ])
    : [];
  const topicCountMap = new Map(topicCounts.map((x) => [String(x._id), Number(x.count || 0)]));
  const subjectsWithCounts = subjects.map((s) => ({
    ...s,
    topicCount: topicCountMap.get(String(s._id)) || 0,
  }));

  const totalPages = limit ? Math.max(1, Math.ceil(total / limit)) : 1;

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      subjects: subjectsWithCounts,
      pagination: {
        q: qRaw || null,
        page,
        limit,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
    },
  });
});

export const listTopicsBySubject = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  const qRaw = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  const pageRaw = typeof req.query?.page === 'string' ? Number(req.query.page) : Number(req.query?.page);
  const limitRaw = typeof req.query?.limit === 'string' ? Number(req.query.limit) : Number(req.query?.limit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 20;
  const skip = (page - 1) * limit;

  const subjectDoc = await Subject.findById(subjectId).select('companyOwner').lean();
  if (!subjectDoc) return next(new AppError('Subject not found', StatusCodes.NOT_FOUND));
  if (subjectDoc.companyOwner) {
    return next(new AppError('Subject not found', StatusCodes.NOT_FOUND));
  }

  const filter = { $and: [{ subject: subjectId }, onlyPublicOwnerFilter()] };
  if (qRaw) {
    const escaped = qRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$and.push({ $or: [{ name: rx }, { description: rx }] });
  }

  const [total, topics] = await Promise.all([
    Topic.countDocuments(filter),
    Topic.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
  ]);

  // solved=true if the current user has at least one finished session for this topic
  const topicIds = topics.map((t) => t._id);
  const solvedTopicIds = topicIds.length
    ? await TestSession.distinct('topic', {
        user: req.user._id,
        status: 'finished',
        topic: { $in: topicIds },
      })
    : [];
  const solvedSet = new Set(solvedTopicIds.map((id) => String(id)));
  const topicsWithSolved = topics.map((t) => ({
    ...t,
    solved: solvedSet.has(String(t._id)),
  }));

  const totalPages = limit ? Math.max(1, Math.ceil(total / limit)) : 1;

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      topics: topicsWithSolved,
      pagination: {
        q: qRaw || null,
        page,
        limit,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
    },
  });
});

/**
 * GET /api/company-test/resume
 * Telefon o‘chib qolsa / ilovadan chiqqan bo‘lsa — kod qayta kiritmasdan davom etish.
 * Bloklangan yoki test yopilgan bo‘lsa: canResume=false (mobil modal chiqarmaydi).
 */
export const resumeCompanyTest = asyncHandler(async (req, res, next) => {
  const preferredSessionId = String(req.query.sessionId || req.query.session_id || '').trim() || null;

  const sessionLean = await findActiveCompanyCodeSession(req.user._id, preferredSessionId);

  if (!sessionLean) {
    return res.status(StatusCodes.OK).json({
      success: true,
      data: buildResumeDenied(
        'no_active_session',
        'Davom ettirish uchun ochiq test topilmadi (vaqtinchalik — pin saqlanishi mumkin).'
      ),
    });
  }

  const session = await TestSession.findById(sessionLean._id);
  if (!session) {
    return res.status(StatusCodes.OK).json({
      success: true,
      data: buildResumeDenied('no_active_session', 'Sessiya topilmadi.'),
    });
  }

  await ensureNotExpired(session);

  if (session.status !== 'in_progress') {
    const reason =
      session.finishedAt && session.expiresAt && session.finishedAt >= session.expiresAt
        ? 'session_expired'
        : 'already_finished';
    return res.status(StatusCodes.OK).json({
      success: true,
      data: buildResumeDenied(
        reason,
        reason === 'session_expired'
          ? 'Test vaqti tugagan.'
          : 'Test allaqachon yakunlangan.'
      ),
    });
  }

  const invite = await resolveInviteForSession(session);

  if (!invite) {
    return res.status(StatusCodes.OK).json({
      success: true,
      data: buildResumeDenied('invite_not_found', 'Kirish kodi topilmadi (pin saqlanishi mumkin).'),
    });
  }

  if (invite.closedAt) {
    return res.status(StatusCodes.OK).json({
      success: true,
      data: buildResumeDenied('test_closed', 'Kompaniya testni yopgan — davom ettirish mumkin emas.'),
    });
  }

  if (isUserBlockedByCompany(req.user, invite.company)) {
    return res.status(StatusCodes.OK).json({
      success: true,
      data: buildResumeDenied(
        'blocked_by_company',
        'Siz ushbu kompaniya testlaridan bloklangansiz.'
      ),
    });
  }

  const topic = await Topic.findById(session.topic).lean();
  if (!topic) {
    return next(new AppError('Topic not found', StatusCodes.NOT_FOUND));
  }

  const companyMeta = await getCompanyPublicById(invite.company);
  const testPlan = await buildInvitePlanMeta(invite);
  const violations = Number(session.companyTabViolationCount) || 0;
  const code = String(session.accessCode || invite.code || '');

  const cheatingSuspected = violations > 0;
  const cheatingMessage = violations
    ? `Test paytida ekrandan chiqish ${violations} marta qayd etilgan. Davom etishingiz mumkin — kompaniya monitoring qiladi.`
    : 'Test to‘xtatilgan edi (telefon yoki ilova yopilgan). Davom etishingiz mumkin — qoidalarga rioya qiling.';

  const idx = session.currentIndex;
  const answered = session.questions.filter((q) => q.selectedAnswer).length;

  return res.status(StatusCodes.OK).json({
    success: true,
    data: {
      canResume: true,
      reason: null,
      clearResumePin: false,
      resumed: true,
      pinPolicy: resumePinPolicyPayload(),
      cheatingWarning: {
        suspected: true,
        violationCount: violations,
        message: cheatingMessage,
        title: cheatingSuspected ? 'Qoida buzish qayd etilgan' : 'Test to‘xtatilgan edi',
      },
      ui: {
        showResumeModal: true,
        resumeTitle: 'Testni davom ettirasizmi?',
        resumeSubtitle: 'Kod qayta kiritish shart emas — oxirgi joydan davom etasiz.',
        primaryButton: 'Davom etish',
        secondaryButton: 'Keyinroq',
      },
      sessionId: session._id,
      inviteId: invite._id,
      accessCode: code,
      sessionType: session.sessionType || 'standard',
      multiTopic: session.sessionType === 'company_multi',
      topic: {
        _id: topic._id,
        name: topic.name,
        minutes: topic.minutes,
        difficulty: topic.difficulty,
      },
      total: session.total,
      score: session.score,
      currentIndex: idx,
      answeredCount: answered,
      expiresAt: session.expiresAt,
      remainingSeconds: remainingSeconds(session),
      current: publicQuestion(session, idx),
      plan: serializeSessionPlan(session),
      segment: buildSegmentContext(session, idx),
      testPlan,
      company: companyMeta,
    },
  });
});

export const previewTopicByAccessCode = asyncHandler(async (req, res, next) => {
  const code = String(req.body?.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return next(new AppError('code must be 6 digits', StatusCodes.BAD_REQUEST));
  }

  const invite = await TopicInviteCode.findOne({ code }).lean();
  if (!invite) {
    return next(new AppError('Invalid access code', StatusCodes.NOT_FOUND));
  }
  if (invite.closedAt) {
    return next(new AppError('Bu test kompaniya tomonidan yopilgan.', StatusCodes.GONE));
  }

  if (isUserBlockedByCompany(req.user, invite.company)) {
    return next(
      new AppError('Siz ushbu kompaniya testlaridan bloklangansiz. Administrator bilan bog‘laning.', StatusCodes.FORBIDDEN)
    );
  }

  const plan = await buildInvitePlanMeta(invite);
  if (!plan.segments.length) {
    return next(new AppError('Test konfiguratsiyasi noto‘g‘ri', StatusCodes.BAD_REQUEST));
  }

  const first = plan.segments[0];
  const subject = first.subject;
  if (!subject) {
    return next(new AppError('Subject not found', StatusCodes.NOT_FOUND));
  }

  const subDoc = await Subject.findById(subject._id).select('companyOwner').lean();
  if (!subDoc?.companyOwner) {
    return next(new AppError('This access code is not valid', StatusCodes.BAD_REQUEST));
  }

  const alreadyDone = await TestSession.findOne({
    user: req.user._id,
    accessCode: code,
    status: 'finished',
    inviteId: invite._id,
  }).lean();
  if (alreadyDone) {
    return next(
      new AppError(
        'Siz ushbu kirish kodi bilan bu testni allaqachon yakunlagansiz. Kompaniya yangi kod bersa, qayta urinib ko‘ring.',
        StatusCodes.FORBIDDEN
      )
    );
  }

  const companyMeta = await getCompanyPublicById(invite.company || subDoc.companyOwner);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      code,
      company: companyMeta,
      ...plan,
      topic: first.topic,
      subject: first.subject,
    },
  });
});

export const startTopic = asyncHandler(async (req, res) => {
  const { session, topic } = await createTestSessionResponse(req.user._id, req.params.topicId, 'public');
  res.status(StatusCodes.CREATED).json(buildSessionStartPayload(session, topic));
});

/** Kompaniya maxfiy mavzu — mobil ilovada `POST` + `{ "code": "123456" }` */
export const startTopicWithAccessCode = asyncHandler(async (req, res, next) => {
  const code = String(req.body?.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return next(new AppError('code must be 6 digits', StatusCodes.BAD_REQUEST));
  }
  const invite = await TopicInviteCode.findOne({ code }).lean();
  if (!invite) {
    return next(new AppError('Invalid access code', StatusCodes.NOT_FOUND));
  }
  if (invite.closedAt) {
    return next(new AppError('Bu test kompaniya tomonidan yopilgan.', StatusCodes.GONE));
  }
  if (isUserBlockedByCompany(req.user, invite.company)) {
    return next(
      new AppError('Siz ushbu kompaniya testlaridan bloklangansiz. Administrator bilan bog‘laning.', StatusCodes.FORBIDDEN)
    );
  }
  let session;
  let topic;
  let resumed = false;
  try {
    const result = await createCompanyCodeSession(req.user._id, invite);
    session = result.session;
    topic = result.topic;
    resumed = result.resumed;
  } catch (e) {
    if (e.statusCode === 403) {
      return next(new AppError(e.message, StatusCodes.FORBIDDEN));
    }
    throw e;
  }

  const companyMeta = await getCompanyPublicById(invite.company);
  const testPlan = await buildInvitePlanMeta(invite);
  res
    .status(StatusCodes.CREATED)
    .json(buildSessionStartPayload(session, topic, companyMeta, { resumed, testPlan }));
});

export const getSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const session = await TestSession.findOne({ _id: sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));

  await ensureNotExpired(session);

  let companyMeta = null;
  const topicLean = await Topic.findById(session.topic).select('subject').lean();
  if (topicLean?.subject) {
    const subLean = await Subject.findById(topicLean.subject).select('companyOwner').lean();
    if (subLean?.companyOwner) {
      companyMeta = await getCompanyPublicById(subLean.companyOwner);
    }
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      session: {
        _id: session._id,
        topic: session.topic,
        status: session.status,
        score: session.score,
        total: session.total,
        currentIndex: session.currentIndex,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        remainingSeconds: remainingSeconds(session),
        finishedAt: session.finishedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        correctCount: session.correctCount,
        wrongCount: session.wrongCount,
        unansweredCount: session.unansweredCount,
      },
      current: session.status === 'in_progress' ? publicQuestion(session, session.currentIndex) : null,
      plan: serializeSessionPlan(session),
      segment: buildSegmentContext(session, session.currentIndex),
      multiTopic: session.sessionType === 'company_multi',
      ...(companyMeta ? { company: companyMeta } : {}),
    },
  });
});

/** GET test rejasi (mavzular ketma-ketligi, joriy segment) */
export const getSessionTestPlan = asyncHandler(async (req, res, next) => {
  const session = await TestSession.findOne({ _id: req.params.sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));
  await ensureNotExpired(session);

  const segment = buildSegmentContext(session, session.currentIndex);
  const transition =
    session.status === 'in_progress' && segment.isFirstQuestionInSegment && segment.segmentIndex > 0
      ? buildSegmentTransition(session, session.currentIndex - 1, session.currentIndex)
      : null;

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      plan: serializeSessionPlan(session),
      segment,
      segmentTransition: transition,
      status: session.status,
      currentIndex: session.currentIndex,
    },
  });
});

/** Keyingi mavzuga o‘tishdan oldin ogohlantirish (mobil modal) */
export const getSessionSegmentTransition = asyncHandler(async (req, res, next) => {
  const session = await TestSession.findOne({ _id: req.params.sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));
  await ensureNotExpired(session);
  if (session.status !== 'in_progress') {
    return next(new AppError('Session is not active', StatusCodes.BAD_REQUEST));
  }

  const idx = Number(req.query.atIndex ?? session.currentIndex);
  const transition = buildSegmentTransition(session, idx - 1, idx);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      hasTransition: Boolean(transition),
      segmentTransition: transition,
      segment: buildSegmentContext(session, idx),
    },
  });
});

/** Bir sessiya uchun kompaniyaga ketma-ket bildirishnomalar orasidagi minimal interval (ms) */
const COMPANY_TAB_VIOLATION_NOTIFY_COOLDOWN_MS = 90_000;

/**
 * Faqat 6 raqamli kod bilan boshlangan (kompaniya) test: foydalanuvchi ekrandan chiqib,
 * frontend `hiddenDurationMs >= 1000` bo‘lganda chaqiradi — testni ochgan kompaniya
 * (`TopicInviteCode.company`) ga notification ketadi.
 */
export const notifyCompanyTestTabLeave = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const hiddenRaw = req.body?.hiddenDurationMs;
  const hiddenDurationMs = Number(hiddenRaw);

  if (!Number.isFinite(hiddenDurationMs) || hiddenDurationMs < 1000) {
    return next(
      new AppError('hiddenDurationMs majburiy va kamida 1000 (1 soniya) bo‘lishi kerak', StatusCodes.BAD_REQUEST)
    );
  }

  const session = await TestSession.findOne({ _id: sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));

  await ensureNotExpired(session);
  if (session.status !== 'in_progress') {
    return next(new AppError('Session is not active', StatusCodes.BAD_REQUEST));
  }

  const code = String(session.accessCode || '');
  if (!/^\d{6}$/.test(code)) {
    return next(
      new AppError(
        'Bu bildirishnoma faqat kompaniya kirish kodi orqali boshlangan test uchun',
        StatusCodes.BAD_REQUEST
      )
    );
  }

  const sub = await Subject.findById(
    (await Topic.findById(session.topic).select('subject').lean())?.subject
  )
    .select('companyOwner')
    .lean();
  if (!sub?.companyOwner) {
    return next(new AppError('Bu bildirishnoma faqat kompaniya testi uchun', StatusCodes.BAD_REQUEST));
  }

  const codeSnap = String(session.accessCode || '');
  const invite = /^\d{6}$/.test(codeSnap)
    ? await TopicInviteCode.findOne({ code: codeSnap }).select('company').lean()
    : await TopicInviteCode.findOne({ topic: session.topic, closedAt: null }).select('company').lean();
  const companyId = invite?.company ? String(invite.company) : String(sub.companyOwner);

  const companyUser = await User.findById(companyId).select('role').lean();
  if (!companyUser || companyUser.role !== 'company') {
    return next(new AppError('Kompaniya vakili topilmadi', StatusCodes.BAD_REQUEST));
  }

  const now = Date.now();
  const lastAt = session.lastCompanyTabViolationNotifiedAt
    ? new Date(session.lastCompanyTabViolationNotifiedAt).getTime()
    : 0;
  if (lastAt && now - lastAt < COMPANY_TAB_VIOLATION_NOTIFY_COOLDOWN_MS) {
    return res.status(StatusCodes.OK).json({
      success: true,
      data: { notified: false, reason: 'cooldown' },
    });
  }

  const participant = await User.findById(req.user._id).select('name firstName lastName email').lean();
  if (!participant) return next(new AppError('User not found', StatusCodes.NOT_FOUND));

  const fn = [participant.firstName, participant.lastName].filter(Boolean).join(' ').trim();
  const displayName = fn || participant.name || 'Foydalanuvchi';

  const seg = buildSegmentContext(session, session.currentIndex);
  const topicLabel = seg?.topic?.name || 'Test';

  const title = 'Kompaniya testi: qoida buzilish';
  const body = `${displayName} (${participant.email}) test paytida ekrandan uzoqroq chiqqan — qoidalarni buzishi mumkin. Mavzu: «${topicLabel}».`;

  await Notification.create({
    user: companyId,
    type: 'company_test_alert',
    title,
    body,
    data: {
      kind: 'test_tab_or_background_leave',
      sessionId: String(session._id),
      topicId: String(seg?.topic?._id || session.topic),
      topicName: topicLabel,
      participantId: String(req.user._id),
      participantEmail: participant.email,
      participantName: displayName,
      hiddenDurationMs: Math.floor(hiddenDurationMs),
    },
  });

  session.lastCompanyTabViolationNotifiedAt = new Date();
  session.companyTabViolationCount = (Number(session.companyTabViolationCount) || 0) + 1;
  await session.save();

  return res.status(StatusCodes.CREATED).json({
    success: true,
    data: { notified: true },
  });
});

export const answerSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const { answer } = req.body || {};

  const session = await TestSession.findOne({ _id: sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));

  await ensureNotExpired(session);
  if (session.status !== 'in_progress') return next(new AppError('Session already finished', StatusCodes.BAD_REQUEST));

  const idx = session.currentIndex;
  const q = session.questions[idx];
  if (!q) return next(new AppError('No current question', StatusCodes.BAD_REQUEST));

  const raw = String(answer || '').trim();
  if (!raw) return next(new AppError('Answer is required', StatusCodes.BAD_REQUEST));

  let selected = raw;
  // Allow sending "A"/"B"/"C"/"D" instead of full option text
  if (/^[ABCD]$/i.test(raw)) {
    const map = { A: 0, B: 1, C: 2, D: 3 };
    const pos = map[raw.toUpperCase()];
    selected = q.options?.[pos];
  }

  if (!selected || !q.options.includes(selected)) {
    return next(new AppError('Answer must be one of the options', StatusCodes.BAD_REQUEST));
  }

  // Prevent re-answering same index
  if (q.selectedAnswer) return next(new AppError('Question already answered', StatusCodes.BAD_REQUEST));

  q.selectedAnswer = selected;
  q.isCorrect = selected === q.correctAnswer;
  if (q.isCorrect) session.score += 1;

  const prevIndex = idx;
  const isLast = idx >= session.questions.length - 1;
  let segmentTransition = null;

  if (isLast) {
    session.status = 'finished';
    session.finishedAt = new Date();
    finalizeSessionCounts(session);
  } else {
    const nextIndex = idx + 1;
    segmentTransition = buildSegmentTransition(session, prevIndex, nextIndex);
    session.currentIndex = nextIndex;
    const seg = buildSegmentContext(session, nextIndex);
    session.currentSegmentIndex = seg.segmentIndex ?? 0;
  }

  await session.save();

  const milestone = await tryGrant80MilestoneOnce(session._id);
  const finishRw = session.status === 'finished' ? await grantFinishRewardsIfNeeded(session._id) : null;

  const snap = session.status === 'finished' ? await TestSession.findById(session._id).lean() : null;

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      isCorrect: q.isCorrect,
      status: session.status,
      score: session.score,
      total: session.total,
      next: session.status === 'in_progress' ? publicQuestion(session, session.currentIndex) : null,
      segment: buildSegmentContext(session, session.currentIndex),
      segmentTransition,
      plan: serializeSessionPlan(session),
      multiTopic: session.sessionType === 'company_multi',
      remainingSeconds: remainingSeconds(session),
      finishedAt: session.finishedAt,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      unansweredCount: session.unansweredCount,
      rewards: {
        milestone80: milestone,
        finish: finishRw,
        sessionTotals:
          snap && snap.status === 'finished'
            ? {
                milestoneCoinsAwarded: snap.milestoneCoinsAwarded || 0,
                finishCoinsAwarded: snap.coinsAwarded || 0,
                finishScoreAwarded: snap.scoreAwarded || 0,
              }
            : null,
        balance: (() => {
          const b = finishRw?.user ?? milestone?.user ?? null;
          return b ? { coins: b.coins, score: b.score } : null;
        })(),
      },
    },
  });
});

export const updateSessionAnswer = asyncHandler(async (req, res, next) => {
  const { sessionId, index } = req.params;
  const { answer } = req.body || {};

  const session = await TestSession.findOne({ _id: sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));

  await ensureNotExpired(session);
  if (session.status !== 'in_progress') return next(new AppError('Session already finished', StatusCodes.BAD_REQUEST));

  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 0 || idx >= session.questions.length) {
    return next(new AppError('Invalid question index', StatusCodes.BAD_REQUEST));
  }

  const q = session.questions[idx];
  if (!q) return next(new AppError('Question not found in session', StatusCodes.BAD_REQUEST));

  const raw = String(answer || '').trim();
  if (!raw) return next(new AppError('Answer is required', StatusCodes.BAD_REQUEST));

  let selected = raw;
  if (/^[ABCD]$/i.test(raw)) {
    const map = { A: 0, B: 1, C: 2, D: 3 };
    const pos = map[raw.toUpperCase()];
    selected = q.options?.[pos];
  }

  if (!selected || !q.options.includes(selected)) {
    return next(new AppError('Answer must be one of the options', StatusCodes.BAD_REQUEST));
  }

  q.selectedAnswer = selected;
  q.isCorrect = selected === q.correctAnswer;

  // Recompute score based on answered questions so far
  session.score = session.questions.filter((qq) => qq.isCorrect === true).length;

  await session.save();

  return res.status(StatusCodes.OK).json({
    success: true,
    message: 'Answer updated',
    data: {
      index: idx,
      isCorrect: q.isCorrect,
      score: session.score,
      total: session.total,
      remainingSeconds: remainingSeconds(session),
      // current question is unchanged (user can keep solving from currentIndex)
      current: publicQuestion(session, session.currentIndex),
    },
  });
});

export const finishSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const session = await TestSession.findOne({ _id: sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));

  await ensureNotExpired(session);
  if (session.status !== 'in_progress') {
    return res.status(StatusCodes.OK).json({
      success: true,
      message: 'Session already finished',
      data: {
        sessionId: session._id,
        status: session.status,
        finishedAt: session.finishedAt,
      },
    });
  }

  session.status = 'finished';
  session.finishedAt = new Date();
  finalizeSessionCounts(session);
  await session.save();

  const advice = buildAdvice({ score: session.score, total: session.total });
  const milestone = await tryGrant80MilestoneOnce(session._id);
  const reward = await grantFinishRewardsIfNeeded(session._id);

  const rx = await TestSession.findById(session._id).lean();

  return res.status(StatusCodes.OK).json({
    success: true,
    message: 'Test finished',
    data: {
      sessionId: session._id,
      status: session.status,
      score: session.score,
      total: session.total,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      unansweredCount: session.unansweredCount,
      percent: advice.percent,
      statusMessage: advice.message,
      statusKey: advice.status,
      finishedAt: session.finishedAt,
      rewards: {
        milestone80: milestone,
        finished: reward,
        milestoneCoinsAwarded: rx?.milestoneCoinsAwarded || 0,
        coinsAwardedFinish: rx?.coinsAwarded || 0,
        scoreAwardedFinish: rx?.scoreAwarded || 0,
        /** mobil uchun bir qatordan jami coin (jarayonda + yakunda) */
        coinsAwardedTotal: (rx?.milestoneCoinsAwarded || 0) + (rx?.coinsAwarded || 0),
        scoreAwardedTotal: rx?.scoreAwarded || 0,
        granted: reward.granted === true,
        belowThreshold: reward.belowThreshold === true,
        balance: (() => {
          const u = reward.user ?? milestone.user;
          return u ? { coins: u.coins, score: u.score } : null;
        })(),
      },
    },
  });
});

export const getSessionResults = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const session = await TestSession.findOne({ _id: sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));

  await ensureNotExpired(session);

  if (session.status !== 'finished') {
    return next(new AppError('Session not finished yet', StatusCodes.BAD_REQUEST));
  }

  // Ensure counts are present for older sessions
  finalizeSessionCounts(session);
  await session.save();

  await tryGrant80MilestoneOnce(session._id);
  await grantFinishRewardsIfNeeded(session._id);

  const rx = await TestSession.findById(session._id).lean();

  const advice = buildAdvice({ score: session.score, total: session.total });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      session: {
        _id: session._id,
        topic: session.topic,
        status: session.status,
        score: session.score,
        total: session.total,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        finishedAt: session.finishedAt,
        correctCount: session.correctCount,
        wrongCount: session.wrongCount,
        unansweredCount: session.unansweredCount,
        percent: advice.percent,
        statusKey: advice.status,
        statusMessage: advice.message,
      },
      questions: session.questions.map((q, index) => ({
        index,
        questionId: q.questionId,
        question: q.prompt,
        options: q.options,
        correctAnswer: q.correctAnswer,
        selectedAnswer: q.selectedAnswer,
        isCorrect: q.isCorrect,
      })),
      rewards: {
        rewardsGranted: rx?.rewardsGranted === true,
        milestoneCoinsAwarded: rx?.milestoneCoinsAwarded || 0,
        coinsAwardedFinish: rx?.coinsAwarded || 0,
        scoreAwardedFinish: rx?.scoreAwarded || 0,
        coinsAwardedTotal: (rx?.milestoneCoinsAwarded || 0) + (rx?.coinsAwarded || 0),
        scoreAwardedTotal: rx?.scoreAwarded || 0,
      },
    },
  });
});

export const listMySessions = asyncHandler(async (req, res) => {
  const sessions = await TestSession.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      sessions: sessions.map((s) => ({
        _id: s._id,
        topic: s.topic,
        status: s.status,
        score: s.score,
        total: s.total,
        correctCount: s.correctCount,
        wrongCount: s.wrongCount,
        unansweredCount: s.unansweredCount,
        startedAt: s.startedAt,
        expiresAt: s.expiresAt,
        finishedAt: s.finishedAt,
        /** Faqat `finished` uchun yakun sanasi (UI); jarayonda `null` */
        completedAt: s.status === 'finished' ? s.finishedAt || s.createdAt : null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        durationSeconds: s.durationSeconds,
      })),
    },
  });
});

export const listSessionHistory = asyncHandler(async (req, res) => {
  const qRaw = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  const pageRaw = typeof req.query?.page === 'string' ? Number(req.query.page) : Number(req.query?.page);
  const limitRaw = typeof req.query?.limit === 'string' ? Number(req.query.limit) : Number(req.query?.limit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 20;
  const skip = (page - 1) * limit;

  const match = { user: req.user._id, status: 'finished' };

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'topics',
        localField: 'topic',
        foreignField: '_id',
        as: 'topicDoc',
      },
    },
    { $unwind: '$topicDoc' },
    ...(qRaw
      ? (() => {
          const escaped = qRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const rx = new RegExp(escaped, 'i');
          return [{ $match: { 'topicDoc.name': rx } }];
        })()
      : []),
    { $sort: { finishedAt: -1, createdAt: -1 } },
    {
      $facet: {
        total: [{ $count: 'count' }],
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              topicId: '$topic',
              testName: '$topicDoc.name',
              score: 1,
              total: 1,
              correctCount: 1,
              wrongCount: 1,
              unansweredCount: 1,
              startedAt: 1,
              expiresAt: 1,
              finishedAt: 1,
              durationSeconds: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ],
      },
    },
  ];

  const agg = await TestSession.aggregate(pipeline);
  const total = agg?.[0]?.total?.[0]?.count || 0;
  const rows = agg?.[0]?.items || [];

  const items = rows.map((s) => {
    const safeTotal = Math.max(0, Number(s.total || 0));
    const safeCorrect = Math.max(0, Number(s.correctCount || 0));
    const pct = safeTotal ? Math.round((safeCorrect / safeTotal) * 1000) / 10 : 0;
    const finishedRaw = s.finishedAt || null;
    const finishedDisplay = finishedRaw || s.createdAt || null;
    return {
      sessionId: s._id,
      topicId: s.topicId,
      testName: s.testName,
      score: s.score,
      total: s.total,
      correctCount: s.correctCount,
      wrongCount: s.wrongCount,
      unansweredCount: s.unansweredCount,
      percent: pct,
      startedAt: s.startedAt,
      expiresAt: s.expiresAt || null,
      /** UI uchun yakun vaqti (eski yozuvlarda `finishedAt` bo‘sh bo‘lsa `createdAt`) */
      finishedAt: finishedDisplay,
      /** DB dagi `finishedAt` (yakunlash bosqichida yozilgan; bo‘sh bo‘lishi mumkin) */
      finishedAtRecorded: finishedRaw,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      durationSeconds: s.durationSeconds ?? 0,
    };
  });

  const totalPages = limit ? Math.max(1, Math.ceil(total / limit)) : 1;

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      items,
      pagination: {
        q: qRaw || null,
        page,
        limit,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
    },
  });
});

export const getSessionHistoryDetail = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const session = await TestSession.findOne({ _id: sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));

  await ensureNotExpired(session);
  if (session.status !== 'finished') {
    return next(new AppError('Session not finished yet', StatusCodes.BAD_REQUEST));
  }

  finalizeSessionCounts(session);
  await session.save();

  const topic = await Topic.findById(session.topic).lean();
  const advice = buildAdvice({ score: session.score, total: session.total });

  const questions = session.questions.map((q, index) => {
    const selectedText = q.selectedAnswer || null;
    const correctText = q.correctAnswer || null;
    const computedIsCorrect =
      typeof q.isCorrect === 'boolean'
        ? q.isCorrect
        : selectedText
          ? selectedText === correctText
          : null;

    let outcome = 'unanswered';
    if (selectedText) {
      outcome = computedIsCorrect === true ? 'correct' : 'wrong';
    }

    return {
      index,
      questionId: q.questionId,
      question: q.prompt,
      choices: publicQuestion(session, index)?.choices || [],
      options: q.options,
      correctAnswer: q.correctAnswer,
      correctLetter: letterForOptionText(q.options, correctText),
      selectedAnswer: q.selectedAnswer,
      selectedText,
      selectedLetter: letterForSelectedAnswer(q),
      isCorrect: computedIsCorrect,
      outcome,
    };
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      session: {
        _id: session._id,
        topic: session.topic,
        testName: topic?.name || null,
        status: session.status,
        score: session.score,
        total: session.total,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        /** Yakunlangan test sanasi (eski yozuvlarda `finishedAt` bo‘sh bo‘lsa `createdAt`) */
        finishedAt: session.finishedAt || session.createdAt,
        /** DB dagi `finishedAt` (null bo‘lishi mumkin) */
        finishedAtRecorded: session.finishedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        durationSeconds: session.durationSeconds,
        correctCount: session.correctCount,
        wrongCount: session.wrongCount,
        unansweredCount: session.unansweredCount,
        percent: advice.percent,
        statusKey: advice.status,
        statusMessage: advice.message,
      },
      questions,
    },
  });
});

export const myAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const sessions = await TestSession.find({ user: userId, status: 'finished' }).lean();
  const totalSessions = sessions.length;
  const totalQuestions = sessions.reduce((acc, s) => acc + (s.total || 0), 0);
  const totalCorrect = sessions.reduce((acc, s) => acc + (s.correctCount || 0), 0);
  const totalWrong = sessions.reduce((acc, s) => acc + (s.wrongCount || 0), 0);
  const totalUnanswered = sessions.reduce((acc, s) => acc + (s.unansweredCount || 0), 0);
  const avgScorePct = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 10000) / 100 : 0;

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      totalSessions,
      totalQuestions,
      totalCorrect,
      totalWrong,
      totalUnanswered,
      avgScorePct,
    },
  });
});

