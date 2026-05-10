import AppError from './AppError.js';

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const messages = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    return next(new AppError(JSON.stringify(messages), 400));
  }

  req.body = value;
  next();
};

export const validateParams = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.params, {
    abortEarly: false,
  });

  if (error) {
    const messages = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    return next(new AppError(JSON.stringify(messages), 400));
  }

  req.params = value;
  next();
};
