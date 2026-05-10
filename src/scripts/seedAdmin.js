import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { User } from '../models/User.js';

const seedDatabase = async () => {
  try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    console.log('MongoDB connected');

    // Clear existing admin
    await User.deleteOne({ email: 'admin@rivoq.com' });

    // Create admin user
    const adminUser = new User({
      name: 'RIVOQ Admin',
      email: 'admin@rivoq.com',
      password: '123123',
      phone: '+998900000000',
      role: 'admin',
      isActive: true,
    });

    await adminUser.save();
    console.log('✓ Admin user created successfully');
    console.log('Email: admin@rivoq.com');
    console.log('Password: 123123');

    await mongoose.disconnect();
    console.log('Database seeding completed');
  } catch (error) {
    console.error('Seeding error:', error.message);
    process.exit(1);
  }
};

seedDatabase();
