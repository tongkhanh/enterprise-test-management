const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connectDB = require('../config/db');
const { User, Role } = require('../models');
const { ensureRoles } = require('../controllers/authController');
const { ROLE_NAMES } = require('../config/roles');

const accountTemplates = [
  { role: ROLE_NAMES.SYSTEM_ADMIN, fullName: 'System Administrator', email: 'system.admin@etms.local' },
  { role: ROLE_NAMES.USER, fullName: 'QA Manager', email: 'qa.manager@etms.local' },
  { role: ROLE_NAMES.USER, fullName: 'ETMS Tester', email: 'tester@etms.local' },
  { role: ROLE_NAMES.USER, fullName: 'ETMS Guest', email: 'guest@etms.local' },
];

const createPassword = () => `Etms-${crypto.randomBytes(9).toString('base64url')}!`;

async function seedFixedAccounts() {
  await connectDB();
  await ensureRoles();
  const createdCredentials = [];

  for (const template of accountTemplates) {
    const role = await Role.findOne({ name: template.role, workspace: null });
    let user = await User.findOne({ email: template.email });
    if (!user) {
      const password = createPassword();
      user = await User.create({
        fullName: template.fullName,
        email: template.email,
        passwordHash: await bcrypt.hash(password, 12),
        role: role._id,
        status: 'active',
        isEmailVerified: true,
      });
      createdCredentials.push({ role: template.role, email: template.email, password });
    } else {
      user.fullName = template.fullName;
      user.role = role._id;
      user.status = 'active';
      user.isEmailVerified = true;
      await user.save({ validateBeforeSave: false });
    }
  }

  console.log(`FIXED_ACCOUNTS=${JSON.stringify({
    accounts: accountTemplates.map(({ role, email }) => ({ role, email })),
    createdCredentials,
  })}`);
}

seedFixedAccounts().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
