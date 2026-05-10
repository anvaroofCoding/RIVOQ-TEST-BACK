import StatusCodes from 'http-status-codes';
import { verifyToken } from '../utils/jwt.js';
import AppError from '../utils/AppError.js';
import { User } from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const parts = authHeader.split(' ').filter(Boolean);
    const token = parts.length ? parts[parts.length - 1] : null;

    if (!token) {
      return next(new AppError('No token provided', StatusCodes.UNAUTHORIZED));
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return next(new AppError('User not found or inactive', StatusCodes.UNAUTHORIZED));
    }

    req.user = user;
    next();
  } catch (error) {
    next(new AppError('Authentication failed', StatusCodes.UNAUTHORIZED));
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('User not authenticated', StatusCodes.UNAUTHORIZED));
  }

  if (!roles.includes(req.user.role)) {
    return next(new AppError('Insufficient permissions', StatusCodes.FORBIDDEN));
  }

  next();
};
