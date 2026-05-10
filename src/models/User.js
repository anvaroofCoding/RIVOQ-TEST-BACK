import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    phone: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'company'],
      default: 'user',
    },
    /** Kompaniya akkaunti (`role=company`) IDsi — ushbu kompaniyaga biriktirilgan oddiy userlar */
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    /** `role=company` bo‘lganda: kompaniya logotipi URL */
    companyLogo: {
      type: String,
      default: null,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailOtpHash: {
      type: String,
      default: null,
    },
    emailOtpExpiresAt: {
      type: Date,
      default: null,
    },
    emailOtpLastSentAt: {
      type: Date,
      default: null,
    },

    // Gamification
    coins: {
      type: Number,
      default: 0,
      min: 0,
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
    },
    dailyFinishedDate: {
      // YYYY-MM-DD in server's timezone (UTC-based implementation in controller)
      type: String,
      default: null,
      index: true,
    },
    dailyFinishedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dailyScoreAwarded: {
      // true when the daily "10 tests => +10 score" bonus is granted
      type: Boolean,
      default: false,
    },

    // Notifications helpers
    lastReminderDate: { type: String, default: null },
    lastKnownRank: { type: Number, default: null, min: 1 },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcryptjs.compare(enteredPassword, this.password);
};

// Don't return password in JSON
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

export const User = mongoose.model('User', userSchema);
