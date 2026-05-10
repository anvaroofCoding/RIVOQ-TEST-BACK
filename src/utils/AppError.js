import StatusCodes from 'http-status-codes';

class AppError extends Error {
  constructor(message, statusCode = StatusCodes.INTERNAL_SERVER_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
