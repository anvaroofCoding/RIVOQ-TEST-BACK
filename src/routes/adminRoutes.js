import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import StatusCodes from 'http-status-codes';
import AppError from '../utils/AppError.js';

const router = express.Router();

// Admin dashboard stats
router.get('/stats', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [totalUsers, totalProducts, activeProducts] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Product.countDocuments({ isActive: true }),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalProducts,
        activeProducts,
        stat: 'success',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get all users (admin)
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(),
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update user (admin)
router.put('/users/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, email, phone, role, isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, role, isActive },
      { new: true, runValidators: true }
    );

    if (!user) {
      return next(new AppError('User not found', StatusCodes.NOT_FOUND));
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Delete user (admin)
router.delete('/users/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });

    if (!user) {
      return next(new AppError('User not found', StatusCodes.NOT_FOUND));
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
      data: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Get all products (admin)
router.get('/products', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
      Product.countDocuments(),
    ]);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update product (admin)
router.put('/products/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return next(new AppError('Product not found', StatusCodes.NOT_FOUND));
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
