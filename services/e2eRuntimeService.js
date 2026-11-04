const { SystemProfile, TestEnvironment } = require('../models');
const { AppError } = require('../utils/http');

// A bound environment is authoritative: never fall back to an old URL when it stops.
function selectRuntime({ profile, environment, testCaseUrl }) {
  if (profile?.environment) {
    if (!environment || String(environment._id) !== String(profile.environment) || environment.status !== 'Ready' || !environment.targetUrl) return null;
    if (String(environment.project) !== String(profile.project)) return null;
    return { targetUrl: environment.targetUrl, environmentId: environment._id };
  }
  const targetUrl = profile ? profile.baseUrl : testCaseUrl;
  return targetUrl ? { targetUrl, environmentId: null } : null;
}

async function resolveCaseRuntime(testCase) {
  if (!testCase.e2e?.systemProfile) return selectRuntime({ testCaseUrl: testCase.targetUrl });
  const profile = await SystemProfile.findById(testCase.e2e.systemProfile).lean();
  if (!profile) throw new AppError('System Profile của Test Case không tồn tại.', 409);
  const environment = profile.environment ? await TestEnvironment.findById(profile.environment).lean() : null;
  return selectRuntime({ profile, environment, testCaseUrl: testCase.targetUrl });
}
module.exports = { selectRuntime, resolveCaseRuntime };
