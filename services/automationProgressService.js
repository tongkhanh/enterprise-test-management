// Job lifecycle progress, not a claim about the percentage of test steps passed.
function automationProgress(status) {
  return { Queued: 0, Preparing: 20, Running: 45, Collecting: 90, Passed: 100, Failed: 100, Error: 100, Skipped: 100, Cancelled: 100 }[status] ?? 0;
}
module.exports = { automationProgress };
