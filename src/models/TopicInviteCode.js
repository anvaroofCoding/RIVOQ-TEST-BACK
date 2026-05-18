import mongoose from 'mongoose';

const inviteSegmentSchema = new mongoose.Schema(
  {
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
    },
    /** `null` yoki yo‘q = mavzudagi barcha savollar; aks holda random shuncha ta */
    pickCount: {
      type: Number,
      default: null,
      min: 1,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const topicInviteCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      match: /^\d{6}$/,
      index: true,
      unique: true,
    },
    /** Ro‘yxat / eski API: birinchi mavzu */
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    closedAt: {
      type: Date,
      default: null,
      index: true,
    },
    /** Ko‘p mavzu: ketma-ket segmentlar */
    segments: {
      type: [inviteSegmentSchema],
      default: [],
    },
  },
  { timestamps: true }
);

topicInviteCodeSchema.virtual('testStatus').get(function testStatusGetter() {
  return this.closedAt ? 'Tugatilgan' : 'Davom etmoqda';
});

topicInviteCodeSchema.virtual('isMultiTopic').get(function isMultiTopicGetter() {
  return Array.isArray(this.segments) && this.segments.length > 1;
});

topicInviteCodeSchema.set('toJSON', { virtuals: true });
topicInviteCodeSchema.set('toObject', { virtuals: true });

export const TopicInviteCode = mongoose.model('TopicInviteCode', topicInviteCodeSchema);
