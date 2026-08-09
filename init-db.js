/**
 * Script khởi tạo database và tạo các collections trên Atlas
 * bằng cách chèn 1 document mẫu vào.
 * Chạy: node init-db.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

async function init() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully!');

    const db = mongoose.connection.db;

    console.log('Creating collections and inserting dummy documents...');

    // 1. Chèn document mẫu vào bug_embeddings để kích hoạt collection
    await db.collection('bug_embeddings').insertOne({
      textContent: "Dummy bug description for vector search validation",
      embedding: new Array(1536).fill(0.0), // Vector 1536 chiều giá trị 0
      dimensions: 1536,
      embeddingModel: "text-embedding-3-small",
      project: new mongoose.Types.ObjectId(), // Fake Project ID để bypass filter
      bug: new mongoose.Types.ObjectId()      // Fake Bug ID
    });
    console.log('  - Created collection "bug_embeddings" and inserted dummy doc.');

    // 2. Chèn document mẫu vào knowledge_bases để kích hoạt collection
    await db.collection('knowledge_bases').insertOne({
      title: "Dummy project requirements documentation",
      content: "This is a dummy chunk of document content for RAG vector search initialization.",
      source: "Manual",
      chunkIndex: 0,
      totalChunks: 1,
      embedding: new Array(1536).fill(0.0), // Vector 1536 chiều giá trị 0
      dimensions: 1536,
      embeddingModel: "text-embedding-3-small",
      isActive: true,
      project: new mongoose.Types.ObjectId(), // Fake Project ID
      uploadedBy: new mongoose.Types.ObjectId() // Fake User ID
    });
    console.log('  - Created collection "knowledge_bases" and inserted dummy doc.');

    console.log('\n✅ Database "enterprise_test_mgmt" and collections initialized!');
    console.log('👉 Vui lòng TẢI LẠI TRANG (F5) MongoDB Atlas để thấy database xuất hiện.');

  } catch (error) {
    console.error('Error during initialization:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

init();
