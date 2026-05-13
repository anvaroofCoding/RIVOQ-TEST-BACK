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
    /** Oddiy sahifa rasmi URL (CDN yoki uploads) */
    avatar: {
      type: String,
      default: null,
    },

    /** Ism (familiyadan ajratilgan, ixtiyoriy) */
    firstName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    lastName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    /** Yoshi (faqat mobil profil uchun) */
    age: {
      type: Number,
      default: null,
      min: 7,
      max: 130,
    },
    biography: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },

    /** Do‘stlarga ko‘rinadigan noyob ID (yangi: 10–16 raqam; eski yozuvlar boshqacha bo‘lishi mumkin) */
    friendId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 32,
      unique: true,
      sparse: true,
    },

    socialInstagram: { type: String, default: '', trim: true, maxlength: 500 },
    socialFacebook: { type: String, default: '', trim: true, maxlength: 500 },
    socialTelegram: { type: String, default: '', trim: true, maxlength: 500 },
    socialX: { type: String, default: '', trim: true, maxlength: 500 },

    /** Ijtimoiy havola qo‘yilganda 200 ta coin (bir marta, har kanal uchun) */
    profileSocialInstagramBonusPaid: { type: Boolean, default: false },
    profileSocialFacebookBonusPaid: { type: Boolean, default: false },
    profileSocialTelegramBonusPaid: { type: Boolean, default: false },
    profileSocialXBonusPaid: { type: Boolean, default: false },

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

    /** «Bugun faolman» uchun — kunlik mukofot (coins/score); `todayKeyUTC()` bilan taqqoslanadi */
    dailyPresenceDate: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

// Hash password va ism sinkronlari
userSchema.pre('save', async function (next) {
  try {
    if ((this.isModified('firstName') || this.isModified('lastName')) && (this.firstName || this.lastName)) {
      const combined = `${(this.firstName || '').trim()} ${(this.lastName || '').trim()}`.trim();
      if (combined.length >= 2) this.name = combined.slice(0, 50);
    }

    if (!this.isModified('password')) return next();

    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

// Method to compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcryptjs.compare(enteredPassword, this.password);
};

// Don't return password in JSON; `friendId` doim kalit sifatida bo‘lsin (null bo‘lishi mumkin)
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  user.friendId = user.friendId != null && String(user.friendId).trim() !== '' ? String(user.friendId).trim() : null;
  return user;
};

export const User = mongoose.model('User', userSchema);
