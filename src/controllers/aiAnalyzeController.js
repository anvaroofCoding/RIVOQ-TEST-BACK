import StatusCodes from 'http-status-codes';
import AppError from '../utils/AppError.js';
import { asyncHandler } from '../utils/validators.js';
import { config } from '../config/index.js';
import { groqChatCompletion } from '../utils/groq.js';
import { TestSession } from '../models/TestSession.js';
import { Topic } from '../models/Topic.js';

function letterForOptionText(options, text) {
  if (!text) return null;
  const idx = (options || []).findIndex((t) => t === text);
  if (idx < 0) return null;
  return ['A', 'B', 'C', 'D'][idx] || null;
}

function tryParseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, value: null };

  // strip ```json fences if model disobeys
  const unfenced = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return { ok: true, value: JSON.parse(unfenced) };
  } catch {
    return { ok: false, value: null };
  }
}

export const analyzeHistoryQuestion = asyncHandler(async (req, res, next) => {
  if (!config.groq.apiKey) {
    return next(new AppError('GROQ_API_KEY is not configured', StatusCodes.SERVICE_UNAVAILABLE));
  }

  const { sessionId, index } = req.params;
  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 0) {
    return next(new AppError('Invalid question index', StatusCodes.BAD_REQUEST));
  }

  const session = await TestSession.findOne({ _id: sessionId, user: req.user._id });
  if (!session) return next(new AppError('Session not found', StatusCodes.NOT_FOUND));

  if (session.status !== 'finished') {
    return next(new AppError('Session not finished yet', StatusCodes.BAD_REQUEST));
  }

  const q = session.questions[idx];
  if (!q) return next(new AppError('Question not found in session', StatusCodes.NOT_FOUND));

  const topic = await Topic.findById(session.topic).lean();

  const selectedText = q.selectedAnswer || null;
  const correctText = q.correctAnswer || null;
  const computedIsCorrect =
    typeof q.isCorrect === 'boolean' ? q.isCorrect : selectedText ? selectedText === correctText : null;

  const outcome = !selectedText ? 'unanswered' : computedIsCorrect === true ? 'correct' : 'wrong';

  const payload = {
    topicName: topic?.name || null,
    difficulty: topic?.difficulty || null,
    minutes: topic?.minutes ?? null,
    question: q.prompt,
    options: q.options,
    selectedText,
    selectedLetter: letterForOptionText(q.options, selectedText),
    correctText,
    correctLetter: letterForOptionText(q.options, correctText),
    outcome,
  };

  const system = [
    'You are a concise Uzbek tutor for multiple-choice tests.',
    'Return ONLY valid JSON (no markdown).',
    'JSON schema:',
    '{',
    '  "summary": string,',
    '  "whyWrong": string|null,',
    '  "keyIdea": string,',
    '  "nextStep": string',
    '}',
    'If outcome is correct, set whyWrong to null.',
    'If unanswered, explain what to look for and how to approach the question.',
  ].join('\n');

  const user = [
    'Analyze this past test question for the student.',
    `Language: ${String(req.body?.lang || 'uz')}`,
    `Context JSON: ${JSON.stringify(payload)}`,
  ].join('\n');

  const model = typeof req.body?.model === 'string' && req.body.model.trim() ? req.body.model.trim() : config.groq.model;

  const out = await groqChatCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    model,
    temperature: 0.2,
    maxTokens: 700,
    responseFormat: { type: 'json_object' },
  });

  const parsed = tryParseJsonObject(out.text);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      sessionId: session._id,
      index: idx,
      questionId: q.questionId,
      context: payload,
      analysis: parsed.ok ? parsed.value : null,
      raw: parsed.ok ? undefined : out.text,
      model: out.model,
      usage: out.usage,
    },
  });
});
