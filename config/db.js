/**
 * ============================================================
 * CẤU HÌNH KẾT NỐI MONGODB ATLAS
 * ============================================================
 * File này thiết lập kết nối đến MongoDB Atlas sử dụng Mongoose.
 *
 * Hướng dẫn sử dụng:
 * 1. Tạo file .env từ .env.example: cp .env.example .env
 * 2. Điền MONGODB_URI từ MongoDB Atlas Dashboard
 * 3. Gọi connectDB() trong server.js trước khi khởi động server
 *
 * Ví dụ trong server.js:
 *   const connectDB = require('./config/db');
 *   connectDB().then(() => app.listen(PORT));
 * ============================================================
 */

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // =============================================
      // Connection Pool Options
      // =============================================
      maxPoolSize: 10,          // Số kết nối tối đa trong pool
      minPoolSize: 2,           // Số kết nối tối thiểu duy trì
      serverSelectionTimeoutMS: 5000,  // Timeout khi chọn server (5s)
      socketTimeoutMS: 45000,          // Timeout cho socket (45s)
      family: 4,                       // Sử dụng IPv4
    });

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);

    // =============================================
    // Connection Event Handlers
    // =============================================

    mongoose.connection.on('connected', () => {
      console.log('🟢 Mongoose connected to MongoDB Atlas');
    });

    mongoose.connection.on('error', (err) => {
      console.error('🔴 Mongoose connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('🟡 Mongoose disconnected from MongoDB Atlas');
    });

    // =============================================
    // Graceful Shutdown - Đóng kết nối khi tắt server
    // =============================================

    const gracefulShutdown = async (signal) => {
      console.log(`\n⚠️  ${signal} received. Closing MongoDB connection...`);
      await mongoose.connection.close();
      console.log('🔒 MongoDB connection closed through app termination');
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    return conn;
  } catch (error) {
    console.error('❌ MongoDB Atlas Connection Failed:', error.message);
    console.error('💡 Hãy kiểm tra lại MONGODB_URI trong file .env');
    process.exit(1);
  }
};

module.exports = connectDB;
