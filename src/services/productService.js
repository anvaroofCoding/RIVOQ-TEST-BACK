import StatusCodes from 'http-status-codes';
import { Product } from '../models/Product.js';
import AppError from '../utils/AppError.js';

export const productService = {
  async getAllProducts(page = 1, limit = 10, filters = {}) {
    const skip = (page - 1) * limit;
    const query = { isActive: true, ...filters };

    const [products, total] = await Promise.all([
      Product.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }),
      Product.countDocuments(query),
    ]);

    return {
      data: products,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  },

  async getProductById(id) {
    const product = await Product.findById(id);
    if (!product || !product.isActive) {
      throw new AppError('Product not found', StatusCodes.NOT_FOUND);
    }
    return product;
  },

  async createProduct(productData) {
    const product = new Product(productData);
    await product.save();
    return product;
  },

  async updateProduct(id, updateData) {
    const product = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      throw new AppError('Product not found', StatusCodes.NOT_FOUND);
    }

    return product;
  },

  async deleteProduct(id) {
    const product = await Product.findByIdAndUpdate(id, { isActive: false }, { new: true });

    if (!product) {
      throw new AppError('Product not found', StatusCodes.NOT_FOUND);
    }

    return product;
  },

  async searchProducts(searchTerm, limit = 10) {
    const products = await Product.find(
      {
        isActive: true,
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } },
          { category: { $regex: searchTerm, $options: 'i' } },
        ],
      },
      null,
      { limit }
    );

    return products;
  },
};
