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
import { grantFinishRewardsIfNeeded, tryGrant80MilestoneOnce } from '../services/testRewards.js';
import { ensureUserFriendIdFresh } from '../services/friendIdService.js';

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

function buildSessionStartPayload(session, topic, companyMeta = null) {
  const data = {
    sessionId: session._id,
    topic: {
      _id: topic._id,
      name: topic.name,
      minutes: topic.minutes,
      difficulty: topic.difficulty,
    },
    total: session.total,
    expiresAt: session.expiresAt,
    remainingSeconds: remainingSeconds(session),
    current: publicQuestion(session, 0),
  };
  if (companyMeta) {
    data.company = companyMeta;
  }
  return {
    success: true,
    message: 'Test started',
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

  const topic = await Topic.findById(invite.topic).lean();
  if (!topic) {
    return next(new AppError('Topic not found', StatusCodes.NOT_FOUND));
  }

  const subject = await Subject.findById(topic.subject).select('name description companyOwner').lean();
  if (!subject) {
    return next(new AppError('Subject not found', StatusCodes.NOT_FOUND));
  }

  if (!subject.companyOwner) {
    return next(new AppError('This access code is not valid', StatusCodes.BAD_REQUEST));
  }

  const qCount = await Question.countDocuments({ topic: topic._id });
  if (!qCount) {
    return next(new AppError('No questions for this topic', StatusCodes.BAD_REQUEST));
  }

  const alreadyDone = await TestSession.findOne({
    user: req.user._id,
    topic: topic._id,
    status: 'finished',
    accessCode: code,
  }).lean();
  if (alreadyDone) {
    return next(
      new AppError(
        'Siz ushbu kirish kodi bilan bu testni allaqachon yakunlagansiz. Kompaniya yangi kod bersa, qayta urinib ko‘ring.',
        StatusCodes.FORBIDDEN
      )
    );
  }

  const questionCount = Math.max(0, Number(topic.questionCount) || 0) || qCount;

  const companyMeta = await getCompanyPublicById(invite.company || subject.companyOwner);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      code,
      company: companyMeta,
      topic: {
        _id: topic._id,
        name: topic.name,
        description: topic.description || '',
        minutes: topic.minutes,
        difficulty: topic.difficulty,
        questionCount,
      },
      subject: {
        _id: subject._id,
        name: subject.name,
        description: subject.description || '',
      },
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
  const { session, topic } = await createTestSessionResponse(req.user._id, invite.topic, 'code', {
    accessCode: invite.code,
  });
  const companyMeta = await getCompanyPublicById(invite.company);
  res.status(StatusCodes.CREATED).json(buildSessionStartPayload(session, topic, companyMeta));
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
        correctCount: session.correctCount,
        wrongCount: session.wrongCount,
        unansweredCount: session.unansweredCount,
      },
      current: session.status === 'in_progress' ? publicQuestion(session, session.currentIndex) : null,
      ...(companyMeta ? { company: companyMeta } : {}),
    },
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

  const isLast = idx >= session.questions.length - 1;
  if (isLast) {
    session.status = 'finished';
    session.finishedAt = new Date();
    finalizeSessionCounts(session);
  } else {
    session.currentIndex += 1;
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
        createdAt: s.createdAt,
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
              finishedAt: 1,
              createdAt: 1,
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
      finishedAt: s.finishedAt || s.createdAt,
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
        finishedAt: session.finishedAt,
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

