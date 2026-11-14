const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectRuntime } = require('../../services/e2eRuntimeService');
const { validateTestCase, isScriptCurrent, options } = require('../../services/automationScriptService');
const { resolveDraftSteps } = require('../../services/automationStepDraftService');

test('E2E runtime follows the bound environment and never reuses a stale URL', () => {
  const profile = { project: 'project-a', environment: 'env-a', baseUrl: 'https://old.example' };
  assert.deepEqual(selectRuntime({ profile, environment: { _id: 'env-a', project: 'project-a', status: 'Ready', targetUrl: 'https://new.example' }, testCaseUrl: 'https://old.example' }), { targetUrl: 'https://new.example', environmentId: 'env-a' });
  assert.equal(selectRuntime({ profile, environment: { _id: 'env-a', project: 'project-a', status: 'Stopped', targetUrl: 'https://new.example' }, testCaseUrl: 'https://old.example' }), null);
  assert.equal(selectRuntime({ profile, environment: { _id: 'env-a', project: 'project-b', status: 'Ready', targetUrl: 'https://new.example' } }), null);
  assert.equal(selectRuntime({ profile: { project: 'project-a', baseUrl: 'https://static.example' } }).targetUrl, 'https://static.example');
});

test('a runtime alone does not make source-only test steps executable', () => {
  const issues = validateTestCase({ targetUrl: 'https://staging.example', testSteps: [{ stepNumber: 1, automationAction: 'manual' }, { stepNumber: 2, automationAction: 'click', locator: null }] });
  assert.equal(issues.filter((issue) => issue.level === 'error').length, 2);
  assert.deepEqual(validateTestCase({ targetUrl: 'https://staging.example', testSteps: [{ stepNumber: 1, automationAction: 'goto', value: '/login' }, { stepNumber: 2, automationAction: 'click', locator: { strategy: 'css', value: '#submit' } }] }), []);
});


test('generated browser scripts resolve relative paths against the selected runtime', () => {
  const testCase = { title: 'Login', targetUrl: 'https://old.example', testSteps: [{ automationAction: 'goto', value: '/login' }] };
  for (const engine of ['Playwright', 'Selenium', 'Cypress', 'WebdriverIO']) {
    const code = options[engine].compile(testCase);
    assert.match(code, /new URL\("\/login"/);
    assert.match(code, /TARGET_URL/);
  }
  assert.match(options.RobotFramework.compile(testCase), /urllib\.parse\.urljoin\(\$TARGET_URL/);
});


test('an approved script becomes stale when its E2E case changes or loses approval', () => {
  const updatedAt = new Date('2026-10-18T00:00:00Z');
  const script = { sourceCaseUpdatedAt: updatedAt };
  const tc = { e2e: { systemProfile: 'profile' }, status: 'Approved', updatedAt };
  assert.equal(isScriptCurrent(script, tc), true);
  assert.equal(isScriptCurrent(script, { ...tc, status: 'Draft' }), false);
  assert.equal(isScriptCurrent(script, { ...tc, updatedAt: new Date(updatedAt.getTime() + 1) }), false);
  assert.equal(isScriptCurrent({}, tc), false);
});

test('runtime drafts use observed controls and credential references and require an assertion', () => {
  const controls = [{ type: 'password', locator: { strategy: 'css', value: '#password' } }];
  const routes = ['/account'];
  const references = ['$secret:test-password'];
  const fill = { action: 'fill', control: 0, value: references[0] };
  const assertion = { action: 'assertUrl', value: routes[0] };
  const draft = (steps) => resolveDraftSteps(steps, controls, routes, references);
  assert.equal(draft([fill, assertion]).length, 2);
  assert.deepEqual(draft([fill]), []);
  assert.deepEqual(draft([{ ...fill, control: 5 }, assertion]), []);
  assert.deepEqual(draft([{ ...fill, value: 'invented-password' }, assertion]), []);
  assert.deepEqual(draft([fill, { ...assertion, value: 'https://outside.example/account' }]), []);
});
