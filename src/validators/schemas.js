import Joi from 'joi';

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().optional(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  phone: Joi.string().optional(),
  avatar: Joi.string().optional(),
  address: Joi.object({
    street: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    zipCode: Joi.string().optional(),
    country: Joi.string().optional(),
  }).optional(),
});

export const createProductSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().required(),
  price: Joi.number().min(0).required(),
  category: Joi.string().required(),
  stock: Joi.number().min(0).optional().default(0),
  image: Joi.string().optional(),
});

export const updateProductSchema = Joi.object({
  name: Joi.string().optional(),
  description: Joi.string().optional(),
  price: Joi.number().min(0).optional(),
  category: Joi.string().optional(),
  stock: Joi.number().min(0).optional(),
  image: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
});
