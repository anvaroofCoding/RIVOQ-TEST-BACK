import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { config } from './index.js';

export const initializePassport = () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: config.google.callbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Google profile'dan email ni olish
          const email = profile.emails[0].value;
          const name = profile.displayName;

          // User'ni database'da qidirish
          let user = await User.findOne({ email });

          // Agar user mavjud bo'lmasa, yangi user yaratish
          if (!user) {
            user = new User({
              name,
              email,
              phone: '',
              password: Math.random().toString(36).slice(-10), // Random password
              role: 'user',
              isActive: true,
              avatar: profile.photos[0]?.value || null,
            });
            await user.save();
            console.log('✓ New user created via Google:', email);
          }

          // JWT token yaratish
          const token = generateToken(user._id);

          return done(null, { user: user.toJSON(), token });
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );

  // Passport user serialization
  passport.serializeUser((data, done) => {
    done(null, data.user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};

export default passport;
