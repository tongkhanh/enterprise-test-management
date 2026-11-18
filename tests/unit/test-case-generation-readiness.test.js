const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planGenerationSnapshot, evaluateGenerationReadiness } = require('../../controllers/e2eController');

const plan = {
  name: 'Approved plan',
  scope: 'Checkout',
  testLevels: ['System'],
  testTypes: ['UI', 'API', 'Integration'],
  coverageTargets: ['100% acceptance criteria'],
  risks: [{ risk: 'Payment failure' }],
};

test('approved Test Plan fields are inherited into the generation snapshot', () => {
  const snapshot = planGenerationSnapshot(plan);
  assert.equal(snapshot.scope, 'Checkout');
  assert.deepEqual(snapshot.testLevels, ['System']);
  assert.deepEqual(snapshot.testTypes, ['UI', 'API', 'Integration']);
  assert.deepEqual(snapshot.coverageTargets, ['100% acceptance criteria']);
  assert.deepEqual(snapshot.productRisks, ['Payment failure']);
});

test('logic design can proceed with explicit assumptions when references are missing', () => {
  const result = evaluateGenerationReadiness({ plan, config: { generationMode: 'logic' }, references: [] });
  assert.equal(result.status, 'Assumptions');
  assert.equal(result.canGenerate, true);
  assert.ok(result.missingInputs.some((item) => item.startsWith('UI:')));
  assert.ok(result.missingInputs.some((item) => item.startsWith('API:')));
  assert.ok(result.assumptions.every((item) => item.startsWith('Cần xác nhận:')));
});

test('technical-context design records assumptions instead of requiring an Environment Profile', () => {
  const result = evaluateGenerationReadiness({ plan, config: { generationMode: 'technicalContext' }, references: [], environmentContext: {} });
  assert.equal(result.status, 'Assumptions');
  assert.equal(result.canGenerate, true);
  assert.equal(result.technicalContextProvided, false);
  assert.ok(result.missingInputs.some((item) => item.startsWith('Bối cảnh kỹ thuật:')));
});

test('technical-context design is ready with matching references and declared components', () => {
  const result = evaluateGenerationReadiness({
    plan,
    config: { generationMode: 'technicalContext' },
    references: [
      { type: 'Figma/Wireframe' },
      { type: 'OpenAPI/Postman' },
      { type: 'Architecture' },
    ],
    environmentContext: { applicationType: 'Web', browsers: ['Chrome'], operatingSystems: ['Windows 11'] },
  });
  assert.equal(result.status, 'Ready');
  assert.equal(result.canGenerate, true);
  assert.deepEqual(result.missingInputs, []);
});

test('logic design is ready without an Environment Profile when required references exist', () => {
  const result = evaluateGenerationReadiness({
    plan,
    config: { generationMode: 'logic' },
    references: [
      { type: 'UI Image' },
      { type: 'OpenAPI/Postman' },
      { type: 'Architecture' },
    ],
  });
  assert.equal(result.status, 'Ready');
  assert.equal(result.technicalContextProvided, false);
  assert.equal(result.canGenerate, true);
  assert.deepEqual(result.assumptions, []);
});
