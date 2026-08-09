/**
 * Script xác minh tất cả 32 Models load thành công
 * Chạy: node verify-models.js
 */
const models = require('./models');

const keys = Object.keys(models);
console.log('============================================');
console.log('  MODEL VERIFICATION REPORT');
console.log('============================================');
console.log('Total models loaded: ' + keys.length);
console.log('Expected: 32');
console.log('Status: ' + (keys.length === 32 ? 'PASS' : 'FAIL'));
console.log('============================================');
console.log('');

keys.forEach(function(k, i) {
  var num = (i + 1).toString().padStart(2, ' ');
  console.log('  ' + num + '. ' + k);
});

console.log('');
console.log('============================================');

if (keys.length === 32) {
  console.log('  All 32 models loaded successfully!');
} else {
  console.log('  WARNING: Expected 32, got ' + keys.length);
}

console.log('============================================');
process.exit(0);
