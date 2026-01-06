---
active: true
iteration: 3
max_iterations: 50
completion_promise: "ALL_ISSUES_CLOSED_TESTS_PASSING"
started_at: "2026-01-06T18:10:26Z"
---

You are implementing TDD issues for gitx.do integration with @dotdo/do.

## Current State
Check: bd ready | head -20
Check: bd stats  
Check: npm test 2>&1 | tail -30

## Workflow Per Iteration

1. IDENTIFY WORK: Run bd ready to find issues with no blockers
2. PARALLEL EXECUTION: Launch up to 5 subagents in parallel using the Task tool:
   - Each subagent handles ONE issue
   - Prefer RED issues first (write failing tests)
   - Then GREEN issues (implement to pass tests)
   - Then REFACTOR issues

3. SUBAGENT PROMPT TEMPLATE:
   For each issue, launch a Task with subagent_type=general-purpose:
   
   Working on issue {ID}: {TITLE}
   
   If RED issue:
   - Write failing test in appropriate test file
   - Run: npm test -- --grep '{test name}'
   - Verify test FAILS (red phase)
   - bd close {ID}
   
   If GREEN issue:
   - Read the corresponding RED test
   - Implement minimal code to pass
   - Run: npm test -- --grep '{test name}'
   - Verify test PASSES
   - bd close {ID}
   
   If REFACTOR issue:
   - Improve code quality
   - Ensure all tests still pass
   - bd close {ID}

4. AFTER SUBAGENTS COMPLETE:
   - Run: npm test
   - Run: bd stats
   - If open issues remain, continue next iteration

## Completion Check
If bd stats shows 0 open issues AND npm test passes:
<promise>ALL_ISSUES_CLOSED_TESTS_PASSING</promise>

## Rules
- Always use parallel Task subagents for efficiency
- Close issues immediately when done (bd close)
- Run bd sync before exiting
- Never skip the test verification step
