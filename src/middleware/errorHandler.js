import StatusCodes from 'http-status-codes';

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  const message = err.message || 'Internal Server Error';

  console.error(`[${new Date().toISOString()}] Error:`, {
    statusCode,
    message,
    path: req.path,
    method: req.method,
  });

  // Validation errors
  if (statusCode === 400 && message.startsWith('[')) {
    try {
      const errors = JSON.parse(message);
      return res.status(statusCode).json({
        success: false,
        statusCode,
        message: 'Validation Error',
        errors,
      });
    } catch (e) {
      // Continue to default error handling
    }
  }

  // Default error response
  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
  });
};

export const notFoundHandler = (req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    statusCode: StatusCodes.NOT_FOUND,
    message: 'Route not found',
  });
};
