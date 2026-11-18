const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { DerivedTestBasis, Requirement, UseCase, UserStory } = require('../../models');

const id = () => new mongoose.Types.ObjectId();

test('DerivedTestBasis keeps AI origin and separate lifecycle', async () => {
  const item = new DerivedTestBasis({
    project: id(),
    targetType: 'UseCase',
    title: 'Use Case gợi ý',
    content: { name: 'Đặt món' },
    sourceArtifacts: [{ artifactType: 'Requirement', artifactId: id(), title: 'REQ-01', statusAtGeneration: 'Baselined' }],
    createdBy: id(),
  });
  await item.validate();
  assert.equal(item.origin, 'AIDerived');
  assert.equal(item.authority, 'Candidate');
  assert.equal(item.status, 'AIDraft');
});

test('adopted derived artifacts create source drafts with explicit provenance values', async () => {
  const requirement = new Requirement({ project: id(), title: 'Nguồn nội bộ', description: 'Cần xác nhận', source: { type: 'InternalAdoptedDerived', title: 'Nguồn nội bộ', receivedAt: new Date() }, createdBy: id() });
  const useCase = new UseCase({ project: id(), name: 'Đặt món', actor: 'Khách hàng', origin: 'AIDerivedAdopted', createdBy: id() });
  const story = new UserStory({ project: id(), title: 'Đặt món', source: 'AIDerivedAdopted', createdBy: id() });
  await Promise.all([requirement.validate(), useCase.validate(), story.validate()]);
  assert.equal(requirement.status, 'Draft');
  assert.equal(useCase.status, 'Draft');
  assert.equal(story.approvalStatus, 'Draft');
});
