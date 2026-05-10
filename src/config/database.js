import mongoose from 'mongoose';
import { config } from './index.js';

export const connectDB = async () => {
  try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    console.log('✓ MongoDB connected successfully');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected successfully');
  } catch (error) {
    console.error('✗ MongoDB disconnection failed:', error.message);
  }
};
