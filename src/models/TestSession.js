import mongoose from 'mongoose';

const sessionQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    prompt: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: String, required: true },
    selectedAnswer: { type: String, default: null },
    isCorrect: { type: Boolean, default: null },
  },
  { _id: false }
);

const testSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    status: { type: String, enum: ['in_progress', 'finished'], default: 'in_progress', index: true },
    currentIndex: { type: Number, default: 0, min: 0 },
    score: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    questions: { type: [sessionQuestionSchema], default: [] },
    startedAt: { type: Date, default: () => new Date() },
    durationSeconds: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null, index: true },
    finishedAt: { type: Date, default: null },
    correctCount: { type: Number, default: 0, min: 0 },
    wrongCount: { type: Number, default: 0, min: 0 },
    unansweredCount: { type: Number, default: 0, min: 0 },

    // Rewards (to avoid double-granting)
    rewardsGranted: { type: Boolean, default: false, index: true },
    coinsAwarded: { type: Number, default: 0, min: 0 },
    scoreAwarded: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const TestSession = mongoose.model('TestSession', testSessionSchema);

