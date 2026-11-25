# Results & Triage delivery

The agreed workflow remains:

Test Run → Result & Evidence → QA Verdict → Bug/Triage → Fix → Retest/Regression → Exit Criteria → Test Summary → Close Test Cycle.

## Stage 1: Results & Triage

- A standalone Results & Triage workspace selects a project and Test Run and reuses the execution result/evidence forms.
- Manual and Automation accept final QA verdicts Passed, Failed, Blocked, or Skipped. Runner outcomes remain provisional until QA confirms the current attempt. Active runners cannot receive a final QA verdict.
- Actual Result, step results, evidence, execution duration in minutes, and bounded QA review history are saved. New automation attempts invalidate the previous confirmation and completion assessment, retaining review history.
- Fail/Blocked results require classification and human triage before new summary reports can be generated. Changing the verdict or Actual Result invalidates the previous triage.
- AI root cause and solution are explicitly proposals. QA can accept, edit, or reject them; manual classification remains usable when AI is unavailable. Analysis of manual evidence uses metadata, not image/video inspection.
- Bug drafts prefill steps, expected/actual results, environment, reviewed root cause, and available execution/runner evidence. New drafts remain PendingApproval; requesting Jira synchronization does not constitute approval.
- Existing data and already exported/approved reports are preserved. Older executions without explicit QA confirmation need confirmation before generating a new summary.

## Remaining staged work

1. Complete Bug review, root-cause review history, and approved Jira synchronization/retry behavior.
2. Link Retest/Regression scheduling and actual executions to Bugs; require QA verification before closure.
3. Add cycle-level exit assessment, residual risks, deviations, release decision and guarded cycle closure.
4. Complete the final report bundle and exports, including Cycle Closure, Release Recommendation and Lessons Learned.

These later stages are not represented as complete by the first-stage workspace.

## First retest checkpoint

Open Results & Triage from the planning/execution sidebar, select ECT and an existing Test Run. Existing runner results should be visible, with a separate QA confirmation state. Confirm a verdict, Actual Result, and duration; refresh to verify persistence. For a failed/blocked result, save a human classification and root cause before proceeding to completion/report assessment. AI is optional. Create a Bug draft only for a QA-confirmed failed case and verify the prefilled context and evidence before saving.

Automated checks use disposable local MongoDB databases and synthetic browser APIs, never Atlas test records or live AI calls.
