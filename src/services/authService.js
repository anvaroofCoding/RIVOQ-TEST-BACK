import StatusCodes from 'http-status-codes';
import { User } from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import AppError from '../utils/AppError.js';

export const authService = {
  async register(userData) {
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      throw new AppError('User already exists', StatusCodes.CONFLICT);
    }

    const user = new User(userData);
    await user.save();

    const token = generateToken(user._id);
    return {
      user: user.toJSON(),
      token,
    };
  },

  async login(email, password) {
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      throw new AppError('Invalid email or password', StatusCodes.UNAUTHORIZED);
    }

    if (!user.isActive) {
      throw new AppError('User account is inactive', StatusCodes.FORBIDDEN);
    }

    const token = generateToken(user._id);
    return {
      user: user.toJSON(),
      token,
    };
  },

  async getUserProfile(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', StatusCodes.NOT_FOUND);
    }
    return user.toJSON();
  },

  async updateProfile(userId, updateData) {
    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      throw new AppError('User not found', StatusCodes.NOT_FOUND);
    }

    return user.toJSON();
  },
};
