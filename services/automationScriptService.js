const { AutomationScript, TestCase } = require('../models');
const { AppError } = require('../utils/http');
const { resolveCaseRuntime } = require('./e2eRuntimeService');

const q = (value) => JSON.stringify(String(value ?? ''));
const slug = (value) => String(value || 'test').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'test';
const locatorValue = (locator = {}) => locator.value || locator.selector || locator.testId || locator.text || '';
const hasManualSteps = (steps = []) => steps.some((step) => !step.automationAction || step.automationAction === 'manual');
const cssLocator = (locator = {}) => {
  if (locator.strategy === 'testId' || locator.testId) return `[data-testid=${q(locatorValue(locator))}]`;
  if (locator.strategy === 'role' && locator.role) return `[role=${q(locator.role)}]`;
  return locatorValue(locator) || 'body';
};
const pwLocator = (locator = {}) => {
  const value = locatorValue(locator);
  if (locator.strategy === 'role' || locator.role) return `page.getByRole(${q(locator.role || value)}, ${locator.name ? `{ name: ${q(locator.name)} }` : '{}'})`;
  if (locator.strategy === 'testId' || locator.testId) return `page.getByTestId(${q(value)})`;
  if (locator.strategy === 'text') return `page.getByText(${q(value)})`;
  return `page.locator(${q(value || 'body')})`;
};

function isScriptCurrent(script, testCase) {
  if (!testCase?.e2e?.systemProfile) return true;
  return ['Approved', 'Active'].includes(testCase.status) && Boolean(script.sourceCaseUpdatedAt && testCase.updatedAt) && new Date(script.sourceCaseUpdatedAt).getTime() === new Date(testCase.updatedAt).getTime();
}

function validateTestCase(testCase) {
  const issues = [];
  if (!testCase.targetUrl) issues.push({ level: 'error', message: 'Test Case chưa có targetUrl.' });
  if (!testCase.testSteps?.length) issues.push({ level: 'error', message: 'Test Case chưa có bước kiểm thử.' });
  for (const step of testCase.testSteps || []) {
    if (!step.automationAction || step.automationAction === 'manual') issues.push({ level: 'error', stepNumber: step.stepNumber, message: 'Bước manual cần Tester hoàn thiện.' });
    if (!['goto', 'assertUrl', 'manual', 'waitForResponse'].includes(step.automationAction) && !locatorValue(step.locator || {}) && !step.locator?.role) issues.push({ level: 'error', stepNumber: step.stepNumber, message: 'Thiếu locator.' });
  }
  return issues;
}

function validateCode({ code, engine }) {
  const issues = [];
  const source = String(code || '');
  if (!source.trim()) return [{ level: 'error', message: 'Script không được để trống.' }];
  if (source.length > 500000) issues.push({ level: 'error', message: 'Script vượt quá 500.000 ký tự.' });
  const required = {
    Playwright: ['@playwright/test', 'test('], Selenium: ['selenium-webdriver', 'new Builder'],
    Cypress: ['describe(', 'cy.'], WebdriverIO: ['webdriverio', 'remote('], RobotFramework: ['*** Test Cases ***'],
  }[engine] || [];
  required.filter((token) => !source.includes(token)).forEach((token) => issues.push({ level: 'error', message: `Script ${engine} thiếu cấu trúc bắt buộc: ${token}` }));
  if (/\b(eval|Function)\s*\(/.test(source)) issues.push({ level: 'error', message: 'Không cho phép eval/Function trong script automation.' });
  if (/TODO manual|# TODO manual/.test(source)) issues.push({ level: 'warning', message: 'Script còn bước manual cần QA hoàn thiện.' });
  return issues;
}

function validateExecutableCode(code) {
  const issues = [];
  if (/\bTODO\b/i.test(code)) issues.push({ level: 'error', message: 'Script còn bước TODO cần hoàn thiện.' });
  if (!/\bexpect\s*\(|\bassert\.|\.should\s*\(|Element Should|Location Should/.test(code)) issues.push({ level: 'error', message: 'Script thiếu assertion kiểm tra kết quả nghiệp vụ.' });
  return issues;
}

function playwright(testCase, language) {
  const lines = (testCase.testSteps || []).map((s) => {
    const l = pwLocator(s.locator || {}); const v = q(s.value || s.testData || '');
    return ({ goto: `await page.goto(new URL(${q(s.value || "")}, targetUrl).toString());`, click: `await ${l}.click();`, fill: `await ${l}.fill(${v});`, select: `await ${l}.selectOption(${v});`, check: `await ${l}.check();`, uncheck: `await ${l}.uncheck();`, press: `await ${l}.press(${v});`, assertText: `await expect(${l}).toContainText(${v});`, assertVisible: `await expect(${l}).toBeVisible();`, assertUrl: `await expect(page).toHaveURL(new URL(${v}, targetUrl).toString());`, waitForResponse: `await page.waitForResponse(response => response.url().includes(${v}));`, manual: `// TODO manual: ${String(s.action).replace(/\r?\n/g, ' ')}` })[s.automationAction] || `// TODO: ${s.action}`;
  });
  return `import { test, expect } from '@playwright/test';\n\nconst targetUrl = process.env.TARGET_URL || ${q(testCase.targetUrl)};\ntest(${q(testCase.title)}, async ({ page }) => {\n  await page.goto(targetUrl);\n${lines.map((x) => `  ${x}`).join('\n')}\n});\n`;
}

function selenium(testCase) {
  const lines = (testCase.testSteps || []).map((s) => {
    const selector = q(cssLocator(s.locator || {})); const v = q(s.value || s.testData || '');
    const el = `await driver.findElement(By.css(${selector}))`;
    return ({ goto: `await driver.get(new URL(${q(s.value || "")}, process.env.TARGET_URL || ${q(testCase.targetUrl)}).toString());`, click: `await (${el}).click();`, fill: `await (${el}).sendKeys(${v});`, select: `await new Select(${el}).selectByVisibleText(${v});`, check: `if (!(await (${el}).isSelected())) await (${el}).click();`, uncheck: `if (await (${el}).isSelected()) await (${el}).click();`, press: `await (${el}).sendKeys(${v});`, assertText: `assert.ok((await (${el}).getText()).includes(${v}));`, assertVisible: `assert.ok(await (${el}).isDisplayed());`, assertUrl: `assert.ok((await driver.getCurrentUrl()).includes(${v}));`, waitForResponse: `// Selenium WebDriver không theo dõi network trực tiếp: ${s.action}`, manual: `// TODO manual: ${s.action}` })[s.automationAction] || `// TODO: ${s.action}`;
  });
  return `const { Builder, By } = require('selenium-webdriver');\nconst { Select } = require('selenium-webdriver/lib/select');\nconst assert = require('node:assert');\n\n(async function test() {\n  const driver = await new Builder().usingServer(process.env.SELENIUM_REMOTE_URL || 'http://127.0.0.1:4444/wd/hub').forBrowser('chrome').build();\n  try {\n    await driver.get(process.env.TARGET_URL || ${q(testCase.targetUrl)});\n${lines.map((x) => `    ${x}`).join('\n')}\n  } finally { await driver.quit(); }\n})();\n`;
}

function cypress(testCase) {
  const lines = (testCase.testSteps || []).map((s) => {
    const el = `cy.get(${q(cssLocator(s.locator || {}))})`; const v = q(s.value || s.testData || '');
    return ({ goto: `cy.visit(new URL(${q(s.value || "")}, Cypress.env('TARGET_URL') || ${q(testCase.targetUrl)}).toString())`, click: `${el}.click()`, fill: `${el}.clear().type(${v})`, select: `${el}.select(${v})`, check: `${el}.check()`, uncheck: `${el}.uncheck()`, press: `${el}.type(${v})`, assertText: `${el}.should('contain.text', ${v})`, assertVisible: `${el}.should('be.visible')`, assertUrl: `cy.url().should('include', ${v})`, waitForResponse: `// TODO cy.intercept trước hành động: ${s.action}`, manual: `// TODO manual: ${s.action}` })[s.automationAction] || `// TODO: ${s.action}`;
  });
  return `describe(${q(testCase.title)}, () => {\n  it('executes generated scenario', () => {\n    cy.visit(Cypress.env('TARGET_URL') || ${q(testCase.targetUrl)})\n${lines.map((x) => `    ${x}`).join('\n')}\n  })\n})\n`;
}

function webdriverio(testCase) {
  const lines = (testCase.testSteps || []).map((s) => {
    const el = `browser.$(${q(cssLocator(s.locator || {}))})`; const v = q(s.value || s.testData || '');
    return ({ goto: `await browser.url(new URL(${q(s.value || "")}, process.env.TARGET_URL || ${q(testCase.targetUrl)}).toString());`, click: `await (await ${el}).click();`, fill: `await (await ${el}).setValue(${v});`, select: `await (await ${el}).selectByVisibleText(${v});`, check: `if (!(await (await ${el}).isSelected())) await (await ${el}).click();`, uncheck: `if (await (await ${el}).isSelected()) await (await ${el}).click();`, press: `await browser.keys(${v});`, assertText: `assert.ok((await (await ${el}).getText()).includes(${v}));`, assertVisible: `assert.ok(await (await ${el}).isDisplayed());`, assertUrl: `assert.ok((await browser.getUrl()).includes(${v}));`, waitForResponse: `// TODO: ${s.action}`, manual: `// TODO manual: ${s.action}` })[s.automationAction] || `// TODO: ${s.action}`;
  });
  return `const { remote } = require('webdriverio');\nconst assert = require('node:assert');\n(async () => {\n  const browser = await remote({ hostname: process.env.SELENIUM_HOST || '127.0.0.1', port: 4444, path: '/wd/hub', capabilities: { browserName: 'chrome' } });\n  try {\n    await browser.url(process.env.TARGET_URL || ${q(testCase.targetUrl)});\n${lines.map((x) => `    ${x}`).join('\n')}\n  } finally { await browser.deleteSession(); }\n})();\n`;
}

function robot(testCase) {
  const lines = (testCase.testSteps || []).map((s) => {
    const el = `css:${cssLocator(s.locator || {})}`; const v = s.value || s.testData || '';
    return ({ goto: s.value ? `${'${destination}'}=    Evaluate    urllib.parse.urljoin($TARGET_URL, ${q(s.value)})    modules=urllib.parse\n    Go To    ${'${destination}'}` : 'Go To    ${TARGET_URL}', click: `Click Element    ${el}`, fill: `Input Text    ${el}    ${v}`, select: `Select From List By Label    ${el}    ${v}`, check: `Select Checkbox    ${el}`, uncheck: `Unselect Checkbox    ${el}`, press: `Press Keys    ${el}    ${v}`, assertText: `Element Should Contain    ${el}    ${v}`, assertVisible: `Element Should Be Visible    ${el}`, assertUrl: `Location Should Contain    ${v}`, waitForResponse: `# TODO network wait: ${s.action}`, manual: `# TODO manual: ${s.action}` })[s.automationAction] || `# TODO: ${s.action}`;
  });
  return `*** Settings ***\nLibrary    SeleniumLibrary\n\n*** Variables ***\n${'${TARGET_URL}'}    %{TARGET_URL=${testCase.targetUrl}}\n\n*** Test Cases ***\n${testCase.title}\n    Open Browser    ${'${TARGET_URL}'}    chrome    remote_url=%{SELENIUM_REMOTE_URL}\n${lines.map((x) => `    ${x}`).join('\n')}\n    [Teardown]    Close All Browsers\n`;
}

const options = {
  Playwright: { language: 'TypeScript', ext: 'spec.ts', compile: playwright },
  Selenium: { language: 'JavaScript', ext: 'selenium.js', compile: selenium },
  Cypress: { language: 'JavaScript', ext: 'cy.js', compile: cypress },
  WebdriverIO: { language: 'JavaScript', ext: 'wdio.js', compile: webdriverio },
  RobotFramework: { language: 'Robot', ext: 'robot', compile: robot },
};

async function generateScript({ testCaseId, engine, userId }) {
  const config = options[engine];
  if (!config) throw new AppError('Automation engine không được hỗ trợ.', 400);
  const testCase = await TestCase.findById(testCaseId).populate('testSuite', 'project');
  if (!testCase) throw new AppError('Test Case không tồn tại.', 404);
  if (testCase.e2e?.systemProfile && !['Approved', 'Active'].includes(testCase.status)) throw new AppError('Test Case E2E phải được duyệt trước khi tạo script.', 409);
  const runtime = await resolveCaseRuntime(testCase);
  if (testCase.e2e?.systemProfile && !runtime) throw new AppError('System Profile chưa có runtime sẵn sàng.', 409);
  const resolvedCase = { ...testCase.toObject(), targetUrl: runtime?.targetUrl || '' };
  const needsDraft = Boolean(testCase.e2e?.systemProfile && hasManualSteps(resolvedCase.testSteps));
  let generationNote = '';
  if (needsDraft) {
    try {
      const draft = await require('./automationStepDraftService').draftAutomationSteps(resolvedCase, runtime, userId, engine);
      if (draft.steps) resolvedCase.testSteps = draft.steps;
      generationNote = draft.note || '';
    } catch {
      generationNote = 'Không thể sinh bước từ môi trường. Hãy kiểm tra Web Analyzer và cấu hình AI, hoặc chỉnh script rồi Validate.';
    }
  }
  const code = config.compile(resolvedCase, config.language);
  const validation = [...validateTestCase(resolvedCase), ...validateCode({ code, engine })];
  if (needsDraft && !validation.some((item) => item.level === 'error')) validation.push(...validateExecutableCode(code));
  return AutomationScript.create({ project: testCase.testSuite.project, testCase: testCase._id, sourceCaseUpdatedAt: testCase.updatedAt, runtimeUrl: needsDraft ? resolvedCase.targetUrl : '', generationNote, engine, language: config.language, filename: `${slug(testCase.title)}.${config.ext}`, code, validation, status: validation.some((x) => x.level === 'error') ? 'Generated' : 'Validated', createdBy: userId });
}

async function validateScript(script) {
  const testCase = await TestCase.findById(script.testCase);
  if (!testCase) throw new AppError('Test Case không tồn tại.', 404);
  const runtime = await resolveCaseRuntime(testCase);
  const resolvedCase = { ...testCase.toObject(), targetUrl: runtime?.targetUrl || '' };
  script.validation = validateCode({ code: script.code, engine: script.engine });
  if (testCase.e2e?.systemProfile && (script.runtimeUrl || hasManualSteps(resolvedCase.testSteps))) {
    if (!runtime || (script.runtimeUrl && script.runtimeUrl !== runtime.targetUrl)) script.validation.push({ level: 'error', message: 'Môi trường đã thay đổi hoặc chưa sẵn sàng. Hãy sinh script mới.' });
    else script.runtimeUrl = runtime.targetUrl;
    script.validation.push(...validateExecutableCode(script.code));
  } else {
    script.validation.push(...validateTestCase(resolvedCase));
  }
  if (!isScriptCurrent(script, testCase)) script.validation.push({ level: 'error', message: 'Test Case đã thay đổi hoặc chưa được duyệt; cần sinh script mới sau khi duyệt.' });
  script.status = script.validation.some((item) => item.level === 'error') ? 'Generated' : 'Validated';
  if (script.status === 'Validated') script.generationNote = '';
  script.approvedBy = null; script.approvedAt = null; script.reviewNote = '';
  await script.save();
  return script;
}

module.exports = { generateScript, validateScript, validateTestCase, validateCode, isScriptCurrent, options };
