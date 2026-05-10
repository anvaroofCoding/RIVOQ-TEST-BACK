import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: ['coin', 'score'],
      index: true,
    },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    meta: {
      sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSession', default: null },
      topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
      subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
      topicName: { type: String, default: null },
      subjectName: { type: String, default: null },
      percent: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

export const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

