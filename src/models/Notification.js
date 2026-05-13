import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['daily_reminder', 'rank_up', 'rank_down', 'system', 'gift'],
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    data: { type: Object, default: {} },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export const Notification = mongoose.model('Notification', notificationSchema);

