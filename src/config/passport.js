import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { config } from './index.js';

export const isGoogleOAuthEnabled = () => {
  const id = config.google.clientID && String(config.google.clientID).trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET && String(process.env.GOOGLE_CLIENT_SECRET).trim();
  return Boolean(id && secret);
};

export const initializePassport = () => {
  if (isGoogleOAuthEnabled()) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: String(config.google.clientID).trim(),
          clientSecret: String(process.env.GOOGLE_CLIENT_SECRET).trim(),
          callbackURL: config.google.callbackURL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails[0].value;
            const name = profile.displayName;

            let user = await User.findOne({ email });

            if (!user) {
              user = new User({
                name,
                email,
                phone: '',
                password: Math.random().toString(36).slice(-10),
                role: 'user',
                isActive: true,
                avatar: profile.photos[0]?.value || null,
              });
              await user.save();
            }

            const token = generateToken(user._id);

            return done(null, { user: user.toJSON(), token });
          } catch (error) {
            return done(error, null);
          }
        }
      )
    );
  }

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
