import Groq from 'groq-sdk';
import { config } from '../config/index.js';

export function getGroqClient() {
  if (!config.groq.apiKey) {
    const err = new Error('GROQ_API_KEY is not configured');
    err.statusCode = 503;
    throw err;
  }
  return new Groq({ apiKey: config.groq.apiKey });
}

export async function groqChatCompletion({ messages, model, temperature, maxTokens, responseFormat }) {
  const groq = getGroqClient();
  const completion = await groq.chat.completions.create({
    model: model || config.groq.model,
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.4,
    max_tokens: typeof maxTokens === 'number' ? maxTokens : 1024,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  });

  const choice = completion?.choices?.[0];
  return {
    text: choice?.message?.content || '',
    usage: completion?.usage || null,
    model: completion?.model || (model || config.groq.model),
  };
}
