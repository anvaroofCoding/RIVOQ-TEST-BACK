import express from 'express';
import * as productController from '../controllers/productController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../utils/validators.js';
import { createProductSchema, updateProductSchema } from '../validators/schemas.js';

const router = express.Router();

router.get('/', productController.getAllProducts);
router.get('/search', productController.searchProducts);
router.get('/:id', productController.getProductById);
router.post('/', authenticate, authorize('admin'), validate(createProductSchema), productController.createProduct);
router.put('/:id', authenticate, authorize('admin'), validate(updateProductSchema), productController.updateProduct);
router.delete('/:id', authenticate, authorize('admin'), productController.deleteProduct);

export default router;
