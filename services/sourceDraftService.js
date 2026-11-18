// Provider outages must not invent business behavior. These are source copies
// for human refinement, not substitutes for AI interpretation or UI discovery.
const texts = (values) => Array.isArray(values) ? values.map((item) => String(item?.criteria || item || '').trim()).filter(Boolean) : [];

function fallbackUserStory(useCase) {
  const sourceCriteria = (useCase.requirements || []).flatMap((item) => texts(item.acceptanceCriteria));
  const conditions = texts(useCase.preconditions).join('; ');
  const outcomes = texts(useCase.postconditions).join('; ');
  const acceptanceCriteria = sourceCriteria.length ? sourceCriteria : [
    `Given ${conditions || useCase.trigger || useCase.name}, When ${texts(useCase.mainFlow).join('; ')}, Then ${outcomes || useCase.summary}`,
    ...texts(useCase.alternateFlows), ...texts(useCase.exceptionFlows),
  ];
  return {
    title: useCase.name,
    description: `As a ${useCase.actor || 'người dùng'}, I want ${useCase.name}, so that ${useCase.summary || outcomes}.`,
    acceptanceCriteria, definitionOfDone: ['Các Acceptance Criteria nguồn đã được rà soát và có thể kiểm thử.'],
    assumptions: texts(useCase.assumptions), dependencies: texts(useCase.dependencies), priority: useCase.risk || 'Medium', storyPoints: 3,
  };
}

function fallbackTestCases({ useCase, story, targetUrl }) {
  const criteria = texts(story.acceptanceCriteria);
  if (!criteria.length) return [];
  return criteria.map((criterion, index) => {
    const parts = criterion.match(/^Given\s+([\s\S]+?)\s*,?\s*When\s+([\s\S]+?)\s*,?\s*Then\s+([\s\S]+)$/i);
    const action = parts?.[2] || criterion;
    const expectedResult = parts?.[3] || '';
    return {
      testCaseId: `TC-E2E-AC-${String(index + 1).padStart(3, '0')}`,
      title: `${story.title || useCase.name} — AC ${index + 1}`,
      objective: criterion,
      description: 'Bản nháp sao chép Acceptance Criteria khi AI không sẵn sàng. Cần rà soát đặc tả; chưa sinh bước tự động.',
      preconditions: parts?.[1] || texts(useCase.preconditions).join('\n'),
      postconditions: expectedResult,
      priority: story.priority || useCase.risk || 'High', estimatedTime: 5,
      environmentRequirement: targetUrl
        ? `Môi trường kiểm thử có thể truy cập tại ${targetUrl}.`
        : 'Thiết kế logic; URL, trình duyệt và thiết bị thực thi cần được xác nhận trước khi chạy.',
      journeyType: 'E2E', storyCoverage: [criterion],
      testDesignTechniques: ['Acceptance criteria testing'],
      testData: { sourceAcceptanceCriterion: criterion },
      routeCoverage: targetUrl ? [targetUrl] : [], setup: [], cleanup: [],
      tags: ['E2E', 'NeedsSpecificationReview', ...(!targetUrl ? ['NeedsRuntimeBinding'] : [])],
      testSteps: [{ action, expectedResult, testData: criterion, automationAction: 'manual', locator: null, value: '' }],
    };
  });
}

module.exports = { fallbackUserStory, fallbackTestCases, texts };
