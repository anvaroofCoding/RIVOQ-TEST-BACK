import mongoose from 'mongoose';

const sessionQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    prompt: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: String, required: true },
    selectedAnswer: { type: String, default: null },
    isCorrect: { type: Boolean, default: null },
    /** Ko‘p mavzuli testda qaysi mavzuga tegishli */
    segmentIndex: { type: Number, default: 0, min: 0 },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
  },
  { _id: false }
);

const sessionSegmentSchema = new mongoose.Schema(
  {
    segmentIndex: { type: Number, required: true, min: 0 },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
    topicName: { type: String, default: '' },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    subjectName: { type: String, default: '' },
    startIndex: { type: Number, required: true, min: 0 },
    endIndex: { type: Number, required: true, min: 0 },
    questionCount: { type: Number, required: true, min: 1 },
    minutes: { type: Number, default: 0, min: 0 },
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

    accessCode: { type: String, default: null, index: true },
    inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'TopicInviteCode', default: null, index: true },

    /** `standard` | `company_multi` */
    sessionType: { type: String, enum: ['standard', 'company_multi'], default: 'standard', index: true },
    segments: { type: [sessionSegmentSchema], default: [] },
    currentSegmentIndex: { type: Number, default: 0, min: 0 },

    rewardsGranted: { type: Boolean, default: false, index: true },
    milestone80Granted: { type: Boolean, default: false, index: true },
    milestoneCoinsAwarded: { type: Number, default: 0, min: 0 },
    coinsAwarded: { type: Number, default: 0, min: 0 },
    scoreAwarded: { type: Number, default: 0, min: 0 },
    rewardVersion: { type: Number, default: 2, min: 1 },

    lastCompanyTabViolationNotifiedAt: { type: Date, default: null },
    companyTabViolationCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const TestSession = mongoose.model('TestSession', testSessionSchema);
