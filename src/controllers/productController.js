import StatusCodes from 'http-status-codes';
import { productService } from '../services/productService.js';
import { asyncHandler } from '../utils/validators.js';

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product management endpoints
 */

/**
 * @swagger
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: Get all products
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of products
 */
export const getAllProducts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const result = await productService.getAllProducts(page, limit);
  res.status(StatusCodes.OK).json({
    success: true,
    data: result,
  });
});

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product details
 */
export const getProductById = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  res.status(StatusCodes.OK).json({
    success: true,
    data: product,
  });
});

/**
 * @swagger
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create new product
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       201:
 *         description: Product created successfully
 */
export const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Product created successfully',
    data: product,
  });
});

/**
 * @swagger
 * /products/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Update product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product updated successfully
 */
export const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Product updated successfully',
    data: product,
  });
});

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted successfully
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await productService.deleteProduct(req.params.id);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Product deleted successfully',
    data: product,
  });
});

/**
 * @swagger
 * /products/search:
 *   get:
 *     tags: [Products]
 *     summary: Search products
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search results
 */
export const searchProducts = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const products = await productService.searchProducts(q);
  res.status(StatusCodes.OK).json({
    success: true,
    data: products,
  });
});
