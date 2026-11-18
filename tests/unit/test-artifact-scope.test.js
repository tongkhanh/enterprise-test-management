const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Requirement, UseCase, SystemProfile } = require('../../models');
const { testCaseBasisIds } = require('../../controllers/e2eController');

test('test basis is isolated by workflow run inside a Project', () => {
  assert.equal(Requirement.schema.path('systemProfile').options.required, undefined);
  assert.equal(UseCase.schema.path('systemProfile').options.required, undefined);

  const requirementIndexes = Requirement.schema.indexes();
  assert.ok(requirementIndexes.some(([fields, options]) => (
    fields.project === 1 && fields.systemProfile === 1 && fields.requirementId === 1 && options.unique === true
  )));

  assert.ok(SystemProfile.schema.path('environment'));
  assert.ok(SystemProfile.schema.path('baseUrl'));
  assert.ok(SystemProfile.schema.path('roles'));
  assert.ok(SystemProfile.schema.path('testData'));
  assert.ok(SystemProfile.schema.path('safetyPolicy.blockRealPayment'));
  assert.ok(SystemProfile.schema.path('repositorySnapshot'));
});

test('coverage merges current traceability fields with legacy E2E references', () => {
  const ids = {
    primary: '64b000000000000000000001',
    linkedRequirement: '64b000000000000000000002',
    legacyRequirement: '64b000000000000000000003',
    linkedStory: '64b000000000000000000004',
    legacyStory: '64b000000000000000000005',
    linkedUseCase: '64b000000000000000000006',
    legacyUseCase: '64b000000000000000000007',
  };
  assert.deepEqual(testCaseBasisIds({
    primaryTestBasis: { basisId: ids.primary },
    linkedRequirements: [ids.linkedRequirement],
    linkedUserStories: [ids.linkedStory],
    linkedUseCases: [ids.linkedUseCase],
    userStory: ids.legacyStory,
    e2e: { requirements: [ids.legacyRequirement], useCase: ids.legacyUseCase },
  }), Object.values(ids));
});
