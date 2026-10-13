/** Xác minh toàn bộ Mongoose models có thể được tải thành công. */
const models = require('./models');

const keys = Object.keys(models);
const expected = 56;
console.log('============================================');
console.log('  MODEL VERIFICATION REPORT');
console.log('============================================');
console.log(`Total models loaded: ${keys.length}`);
console.log(`Expected: ${expected}`);
console.log(`Status: ${keys.length === expected ? 'PASS' : 'FAIL'}`);
console.log('============================================\n');

keys.forEach((key, index) => console.log(`  ${String(index + 1).padStart(2, ' ')}. ${key}`));
console.log('\n============================================');
console.log(keys.length === expected ? `  All ${expected} models loaded successfully!` : `  WARNING: Expected ${expected}, got ${keys.length}`);
console.log('============================================');
process.exit(keys.length === expected ? 0 : 1);
