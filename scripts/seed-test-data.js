const mongoose = require('mongoose');
require('dotenv').config();
    const { Workspace, Project, UserStory, TestSuite, User } = require('../models');

async function seedData() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const admin = await User.findOne({ email: 'admin@company.com' });
    if (!admin) throw new Error('Admin user not found. Please run the register API first.');

    // 1. Create a dummy Workspace
    const workspace = await Workspace.findOneAndUpdate(
      { slug: 'demo-workspace' },
      { name: 'Demo Workspace', owner: admin._id, description: 'Workspace for testing', isActive: true },
      { upsert: true, new: true }
    );
    console.log('Workspace:', workspace._id);

    // 2. Create a dummy Project
    const project = await Project.findOneAndUpdate(
      { key: 'DEMO' },
      { workspace: workspace._id, name: 'Demo Project', description: 'A sample project to test the AI Web Analyzer', status: 'Active' },
      { upsert: true, new: true }
    );
    console.log('Project:', project._id);

    // 3. Create a dummy User Story
    const story = await UserStory.findOneAndUpdate(
      { project: project._id, title: 'User Login feature' },
      {
        createdBy: admin._id,
        description: 'As a user, I want to be able to log in with my email and password so I can access my account.',
        acceptanceCriteria: [
          { criteria: '1. User must provide email and password.' },
          { criteria: '2. System validates email format.' },
          { criteria: '3. Show error if login fails.' },
          { criteria: '4. Redirect to dashboard on success.' }
        ],
        priority: 'High',
        status: 'Backlog'
      },
      { upsert: true, new: true }
    );
    console.log('User Story:', story._id);

    // 4. Create a dummy Test Suite
    const suite = await TestSuite.findOneAndUpdate(
      { project: project._id, name: 'Login Tests' },
      { createdBy: admin._id, description: 'Test suite for authentication features' },
      { upsert: true, new: true }
    );
    console.log('Created Test Suite:', suite._id);

    console.log('\nData seeded successfully! You can now test the AI Generator UI.');

  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

seedData();
