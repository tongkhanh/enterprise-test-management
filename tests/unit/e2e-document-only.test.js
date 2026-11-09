const { test } = require('node:test');
const assert = require('node:assert/strict');
const access = require('../../services/projectAccessService');
const originalAccess = access.assertProjectAccess;
access.assertProjectAccess = async () => ({});
const controller = require('../../controllers/e2eController');
access.assertProjectAccess = originalAccess;
const { SystemProfile, UseCase, UserStory, TestSuite, TestCase, TestPlan } = require('../../models');
const ai = require('../../services/aiService');

test('manual and GitHub profiles can create document drafts without a runtime', async () => {
  const originals = { create: SystemProfile.create, countProfiles: SystemProfile.countDocuments, updateProfiles: SystemProfile.updateMany, findUseCase: UseCase.findById, findStory: UserStory.findById, findSuite: TestSuite.findById, findPlan: TestPlan.findById, insert: TestCase.insertMany, complete: ai.complete };
  const id = (digit) => digit.repeat(24);
  const project = id('1'); const profileId = id('2'); const useCaseId = id('3'); const storyId = id('4'); const suiteId = id('5'); const planId = id('6');
  let response; let inserted;
  const res = { status(code) { this.code = code; return this; }, json(data) { response = data; return data; } };
  try {
    SystemProfile.create = async (body) => body;
    SystemProfile.countDocuments = async () => 2;
    SystemProfile.updateMany = async () => ({ modifiedCount: 1 });
    await controller.createProfile({ user: { _id: id('7') }, body: { project, name: 'Manual system', mode: 'SystemProfile', description: 'A student submits an assignment.', baseUrl: '' } }, res);
    assert.equal(res.code, 201);
    assert.equal(response.data.baseUrl, '');
    assert.match(response.data.description, /student/);
    assert.equal(response.data.workflow.runNumber, 3);
    assert.equal(response.data.workflow.status, 'Active');
    assert.equal(response.data.workflow.lastStep, 'requirement');

    const story = { _id: storyId, project, approvalStatus: 'Approved', acceptanceCriteria: [{ criteria: 'Submission is saved' }], toObject() { return this; } };
    UserStory.findById = async () => story;
    TestSuite.findById = async () => ({ _id: suiteId, project, name: 'E2E suite', description: 'Document-only E2E test design', origin: 'SystemE2E', systemProfile: profileId });
    TestPlan.findById = async () => ({ kind: 'TestPlan', approvalStatus: 'Approved', project, systemProfile: profileId, userStories: [storyId] });
    TestCase.insertMany = async (rows) => { inserted = rows; return rows; };
    ai.complete = async () => ({ text: JSON.stringify({ testCases: [{ title: 'Submit', testSteps: [{ action: 'Open submission', expectedResult: 'Submission page appears', automationAction: 'goto', locator: { strategy: 'css', value: '#invented' } }] }] }) });
    for (const mode of ['SystemProfile', 'GitHubE2E']) {
      const profile = { _id: profileId, project, mode, baseUrl: '', environment: null, roles: [], toObject() { return this; } };
      const useCase = { _id: useCaseId, project, status: 'Approved', name: 'Submit', systemProfile: profile, toObject() { return this; } };
      UseCase.findById = () => ({ populate: async () => useCase });
      await controller.generateCases({ user: { _id: id('7') }, params: { useCaseId }, body: { testSuiteId: suiteId, userStoryId: storyId, testPlanId: planId } }, res);
      assert.equal(res.code, 201);
      assert.equal(inserted[0].targetUrl, '');
      assert.ok(inserted[0].tags.includes('NeedsRuntimeBinding'));
      assert.equal(inserted[0].testSteps[0].automationAction, 'manual');
      assert.equal(inserted[0].testSteps[0].locator, null);
    }
  } finally {
    SystemProfile.create = originals.create; SystemProfile.countDocuments = originals.countProfiles; SystemProfile.updateMany = originals.updateProfiles; UseCase.findById = originals.findUseCase; UserStory.findById = originals.findStory; TestSuite.findById = originals.findSuite; TestPlan.findById = originals.findPlan; TestCase.insertMany = originals.insert; ai.complete = originals.complete;
  }
});
