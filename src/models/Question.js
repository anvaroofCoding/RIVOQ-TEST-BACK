import mongoose from 'mongoose';
import { Topic } from './Topic.js';

const questionSchema = new mongoose.Schema(
  {
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2000,
    },
    correctAnswer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    wrongAnswer1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    wrongAnswer2: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    wrongAnswer3: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

questionSchema.pre('save', function (next) {
  this._wasNew = this.isNew;
  next();
});

questionSchema.pre('validate', function () {
  const correct = String(this.correctAnswer ?? '').trim();
  if (!correct) {
    this.invalidate('correctAnswer', 'correctAnswer is required');
    return;
  }
  const wrongs = [
    String(this.wrongAnswer1 ?? '').trim(),
    String(this.wrongAnswer2 ?? '').trim(),
    String(this.wrongAnswer3 ?? '').trim(),
  ];
  if (wrongs.some((w) => !w)) {
    this.invalidate('wrongAnswer1', '3 ta xato javob hammasi to‘ldirilishi kerak');
    return;
  }
  if (wrongs.includes(correct)) {
    this.invalidate('wrongAnswer1', "Xato javoblar ichida to‘g‘ri javob bo‘lmasin");
    return;
  }
  const set = new Set([correct, ...wrongs]);
  if (set.size !== 4) {
    this.invalidate('wrongAnswer1', 'Javoblar bir xil bo‘lib qolmasin (hammasi unique bo‘lsin)');
  }
});

questionSchema.post('save', async function (doc, next) {
  try {
    if (doc._wasNew === true) {
      await Topic.updateOne({ _id: doc.topic }, { $inc: { questionCount: 1 } });
    }
    next();
  } catch (e) {
    next(e);
  }
});

questionSchema.post('findOneAndDelete', async function (doc, next) {
  try {
    if (doc?.topic) {
      await Topic.updateOne({ _id: doc.topic }, { $inc: { questionCount: -1 } });
    }
    next();
  } catch (e) {
    next(e);
  }
});

questionSchema.post('deleteOne', { document: true, query: false }, async function (doc, next) {
  try {
    if (doc?.topic) {
      await Topic.updateOne({ _id: doc.topic }, { $inc: { questionCount: -1 } });
    }
    next();
  } catch (e) {
    next(e);
  }
});

export const Question = mongoose.model('Question', questionSchema);

