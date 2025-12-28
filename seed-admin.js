const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');
require('dotenv').config();

// Get command line arguments for custom email and password
const customEmail = process.argv[2];
const customPassword = process.argv[3];

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/avantika-travels');

    const email = customEmail || 'admin@avanikatravels.com';
    const password = customPassword || 'Admin@123456';

    // Delete any existing admin users
    await Admin.deleteMany({});
    console.log('Removed existing admin users');

    // Create new admin user
    const admin = new Admin({
      username: 'admin',
      email,
      password // This will be hashed by the pre-save hook
    });

    await admin.save();
    console.log('New admin user created successfully');

    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\nUsage: node seed-admin.js [email] [password]');
    console.log('Example: node seed-admin.js myadmin@example.com MySecurePass123');

  } catch (error) {
    console.error('Error seeding admin:', error);
  } finally {
    await mongoose.connection.close();
  }
};

seedAdmin();
