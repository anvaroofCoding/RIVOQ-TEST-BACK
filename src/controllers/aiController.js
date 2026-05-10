import StatusCodes from 'http-status-codes';
import AppError from '../utils/AppError.js';
import { asyncHandler } from '../utils/validators.js';
import { config } from '../config/index.js';
import { groqChatCompletion } from '../utils/groq.js';

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  const cleaned = messages
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      role: String(m.role || '').trim(),
      content: String(m.content || '').trim(),
    }))
    .filter((m) => (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && m.content);

  if (!cleaned.length) return null;
  if (cleaned.length > 30) return null;
  return cleaned;
}

export const chat = asyncHandler(async (req, res, next) => {
  if (!config.groq.apiKey) {
    return next(new AppError('GROQ_API_KEY is not configured', StatusCodes.SERVICE_UNAVAILABLE));
  }

  const body = req.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const messages = normalizeMessages(body.messages);

  let finalMessages = messages;
  if (!finalMessages) {
    if (!prompt) return next(new AppError('prompt or messages is required', StatusCodes.BAD_REQUEST));
    finalMessages = [{ role: 'user', content: prompt }];
  }

  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : config.groq.model;
  const temperature = typeof body.temperature === 'number' ? body.temperature : undefined;
  const maxTokens = typeof body.maxTokens === 'number' ? body.maxTokens : undefined;

  const out = await groqChatCompletion({ messages: finalMessages, model, temperature, maxTokens });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      text: out.text,
      model: out.model,
      usage: out.usage,
    },
  });
});
