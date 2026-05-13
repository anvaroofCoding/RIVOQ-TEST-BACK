import { Topic } from '../models/Topic.js';
import { TestSession } from '../models/TestSession.js';
import { User } from '../models/User.js';
import { WalletTransaction } from '../models/WalletTransaction.js';

/**
 * Mukofot qoidalari (mobil dizayn bilan kelishilgan):
 *
 * **80%+ jarayon (javoblangan savollar orasida)** bir marta: coin — QIYIN 10 · O‘RTACHA 5 · OSON 2;
 * shu mavzuni ilgari tugatgan bo‘lsa 1 coin. (`test_milestone_80`)
 *
 * **Yakunda** (to‘liq yakunlangan + umumiy to‘g‘rilik ≥80%): score — OSON 1 · O‘RTACHA 2 · QIYIN 3,
 * tashkilot testi (`companyOwner` yoki kod bilan kirish) +10 coin, savollar soni: ≥20 (+2/+2), ≥50 (+5/+5),
 * ≥100 (+10 score, +27 coin). (`test_finish_bonus`)
 *
 * Kunlik «Bugun faolman»: +2 coin +1 score (UTC kuniga 1 martta). `/wallet/daily-active`
 */

/** YYYY-MM-DD UTC */
export function todayKeyUTC(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** OSON | O'RTACHA | QIYIN → milestone coin (80%+ jarayonda) va yakunda score asosiy ko‘paytmasi */
export function difficultyTiers(difficulty) {
  const d = difficulty === undefined || difficulty === null ? '' : String(difficulty);
  if (d === 'QIYIN') return { milestoneCoin: 10, scoreOnPass: 3 };
  if (d === "O'RTACHA") return { milestoneCoin: 5, scoreOnPass: 2 };
  /* default OSON va noma'lum */
  return { milestoneCoin: 2, scoreOnPass: 1 };
}

/** Yakun uchun savollar soni bo‘yicha qo'shimcha (eng yuqori darajadan bittasi — optimallashtirilgan) */
export function lengthBonuses(total) {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  if (t >= 100) return { extraScore: 10, extraCoins: 27 };
  if (t >= 50) return { extraScore: 5, extraCoins: 5 };
  if (t >= 20) return { extraScore: 2, extraCoins: 2 };
  return { extraScore: 0, extraCoins: 0 };
}

export async function topicCompletedBeforeOthers(userId, topicId, excludeSessionId) {
  const fq = {
    user: userId,
    topic: topicId,
    status: 'finished',
  };
  if (excludeSessionId) fq._id = { $ne: excludeSessionId };
  const n = await TestSession.countDocuments(fq);
  return n > 0;
}

async function topicOrgContext(topicId, sessionAccessCode) {
  const t = await Topic.findById(topicId).populate('subject', 'companyOwner').lean();
  const companyViaTopic = Boolean(t?.companyOwner);
  const companyViaSubject = Boolean(t?.subject && typeof t.subject === 'object' && t.subject.companyOwner);
  const isOrgTopic = companyViaTopic || companyViaSubject || Boolean(sessionAccessCode);
  const difficulty = t?.difficulty || 'OSON';
  return { isOrgTopic, difficulty };
}

function runningPercentAmongAnswered(questions) {
  const qs = Array.isArray(questions) ? questions : [];
  const answered = qs.filter((q) => q?.selectedAnswer);
  if (!answered.length) return 0;
  const correct = answered.filter((q) => q.isCorrect === true).length;
  return Math.round((correct / answered.length) * 1000) / 10;
}

/**
 * Jarayonda (har bir toʻgʻri javobdan keyin): bir marta beriladi — javoblangan savollar orasida toʻgʻrilik ≥80%.
 * Avval mazkur mavzuni yakunlangan bolsa milestone coin = 1, aks holda qiyinchilikka qarab 10/5/2.
 */
export async function tryGrant80MilestoneOnce(sessionId) {
  const s = await TestSession.findById(sessionId);
  if (!s) return { granted: false, coins: 0, reason: null };

  if (
    s.status === 'finished' &&
    s.rewardsGranted === true &&
    (!s.rewardVersion || s.rewardVersion < 2) &&
    s.milestone80Granted !== true
  ) {
    return { granted: false, coins: 0, reason: null };
  }

  /** milestone80Granted — bir marta; oxirgi javobda status allaqachon finished bo‘lishi mumkin */
  if (!['in_progress', 'finished'].includes(s.status) || s.milestone80Granted === true) {
    return { granted: false, coins: 0, reason: null };
  }

  const pct = runningPercentAmongAnswered(s.questions);
  if (!(pct >= 80)) return { granted: false, coins: 0, reason: null };

  const { isOrgTopic: _ignored, difficulty } = await topicOrgContext(s.topic, s.accessCode);

  const hadPriorFinished = await topicCompletedBeforeOthers(s.user, s.topic, s._id);
  const tier = difficultyTiers(difficulty);
  const coinsToAdd = hadPriorFinished ? 1 : tier.milestoneCoin;

  const claimed = await TestSession.findOneAndUpdate(
    { _id: sessionId, milestone80Granted: { $ne: true } },
    { $set: { milestone80Granted: true }, $inc: { milestoneCoinsAwarded: coinsToAdd } },
    { new: true }
  );
  if (!claimed) return { granted: false, coins: 0, reason: null };

  const user = await User.findById(s.user);
  if (!user) return { granted: false, coins: 0, reason: null };
  user.coins += coinsToAdd;
  await user.save();

  try {
    const snap = await buildTopicSnap(s.topic);
    await WalletTransaction.create({
      user: user._id,
      kind: 'coin',
      amount: coinsToAdd,
      reason: 'test_milestone_80',
      meta: {
        sessionId: s._id,
        topicId: s.topic,
        subjectId: snap.subjectId,
        topicName: snap.topicName,
        subjectName: snap.subjectName,
        percent: pct,
      },
    });
  } catch {
    /* log optional */
  }

  return {
    granted: true,
    coins: coinsToAdd,
    reason: hadPriorFinished ? 'repeat_topic' : 'first_topic',
    user: { coins: user.coins, score: user.score },
  };
}

async function buildTopicSnap(topicId) {
  let topicSnap = { subjectId: null, topicName: null, subjectName: null };
  try {
    const tdoc = await Topic.findById(topicId).populate('subject', 'name').lean();
    if (tdoc) {
      topicSnap.topicName = tdoc.name || null;
      const sub = tdoc.subject;
      if (sub && typeof sub === 'object') {
        topicSnap.subjectId = sub._id || null;
        topicSnap.subjectName = sub.name || null;
      }
    }
  } catch {
    /* ignore */
  }
  return topicSnap;
}

/**
 * Sessiya tugaganda — faqat yakun uchun (milestone alohida). Toʻgʻrilik % ≥80 bo‘lsa mukofot.
 */
export async function grantFinishRewardsIfNeeded(sessionDocOrId) {
  const sid = typeof sessionDocOrId === 'object' && sessionDocOrId._id ? sessionDocOrId._id : sessionDocOrId;

  const session = await TestSession.findById(sid);
  if (!session || session.status !== 'finished') return { granted: false };
  if (session.rewardsGranted === true) return { granted: false };

  const total = Math.max(0, Number(session.total || session.questions?.length || 0));
  const correct = Math.max(0, Number(session.correctCount ?? session.score ?? 0));
  const pct = total ? Math.round((correct / total) * 1000) / 10 : 0;

  if (!(pct >= 80)) {
    session.rewardsGranted = true;
    session.coinsAwarded = 0;
    session.scoreAwarded = 0;
    await session.save();
    const u = await User.findById(session.user).select('coins score dailyFinishedDate dailyFinishedCount').lean();
    return {
      granted: true,
      belowThreshold: true,
      coinsAwarded: 0,
      scoreAwarded: 0,
      milestoneCoinsEarlier: session.milestoneCoinsAwarded || 0,
      user: u ? { coins: u.coins, score: u.score, dailyFinishedDate: u.dailyFinishedDate, dailyFinishedCount: u.dailyFinishedCount } : null,
    };
  }

  const { isOrgTopic, difficulty } = await topicOrgContext(session.topic, session.accessCode);
  const { scoreOnPass } = difficultyTiers(difficulty);
  const lb = lengthBonuses(total);

  let scoreAdd = scoreOnPass + lb.extraScore;
  let coinAdd = lb.extraCoins;
  if (isOrgTopic) coinAdd += 10;

  const user = await User.findById(session.user);
  if (!user) return { granted: false };

  if (scoreAdd > 0) user.score += scoreAdd;
  if (coinAdd > 0) user.coins += coinAdd;
  await user.save();

  session.rewardsGranted = true;
  /** Faqat yakun bonuslari (milestone coins alohida `milestoneCoinsAwarded`) */
  session.coinsAwarded = coinAdd;
  session.scoreAwarded = scoreAdd;
  await session.save();

  const snap = await buildTopicSnap(session.topic);

  try {
    const txs = [];
    if (coinAdd > 0) {
      txs.push({
        user: user._id,
        kind: 'coin',
        amount: coinAdd,
        reason: 'test_finish_bonus',
        meta: {
          sessionId: session._id,
          topicId: session.topic,
          subjectId: snap.subjectId,
          topicName: snap.topicName,
          subjectName: snap.subjectName,
          percent: pct,
        },
      });
    }
    if (scoreAdd > 0) {
      txs.push({
        user: user._id,
        kind: 'score',
        amount: scoreAdd,
        reason: 'test_finish_bonus',
        meta: {
          sessionId: session._id,
          topicId: session.topic,
          subjectId: snap.subjectId,
          topicName: snap.topicName,
          subjectName: snap.subjectName,
          percent: pct,
        },
      });
    }
    if (txs.length) await WalletTransaction.insertMany(txs);
  } catch {
    /* ignore */
  }

  return {
    granted: true,
    belowThreshold: false,
    coinsAwarded: coinAdd,
    scoreAwarded: scoreAdd,
    milestoneCoinsEarlier: session.milestoneCoinsAwarded || 0,
    user: { coins: user.coins, score: user.score, dailyFinishedDate: user.dailyFinishedDate, dailyFinishedCount: user.dailyFinishedCount },
  };
}

/** «Bugun faolman» — kuniga 2 coin + 1 score */
export async function claimDailyPresence(userId) {
  const today = todayKeyUTC();

  const r = await User.updateOne(
    { _id: userId, $or: [{ dailyPresenceDate: { $exists: false } }, { dailyPresenceDate: null }, { dailyPresenceDate: { $ne: today } }] },
    { $inc: { coins: 2, score: 1 }, $set: { dailyPresenceDate: today } }
  );

  if (!r.modifiedCount) {
    return { ok: false, alreadyClaimed: true };
  }

  const user = await User.findById(userId).select('coins score dailyPresenceDate').lean();

  try {
    await WalletTransaction.insertMany([
      { user: userId, kind: 'coin', amount: 2, reason: 'daily_presence', meta: {} },
      { user: userId, kind: 'score', amount: 1, reason: 'daily_presence', meta: {} },
    ]);
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    alreadyClaimed: false,
    awarded: { coins: 2, score: 1 },
    balance: { coins: user?.coins ?? 0, score: user?.score ?? 0 },
    dailyPresenceDate: user?.dailyPresenceDate ?? today,
  };
}
