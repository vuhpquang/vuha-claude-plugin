import { expect, test } from 'claude-code/testing'

import { bar, parsePlan, progress, summary } from '../hooks/steps'

test('accepts a plan, trims it and keeps notes only when given', async () => {
  expect(
    parsePlan({
      goal: ' Ship it ',
      steps: [
        { title: ' Read code ', status: 'done', note: ' found 2 callers ' },
        { title: 'Fix', status: 'in_progress', note: '' },
        { title: 'Test', status: 'pending' },
      ],
    }),
  ).toEqual({
    goal: 'Ship it',
    steps: [
      { title: 'Read code', status: 'done', note: 'found 2 callers' },
      { title: 'Fix', status: 'in_progress' },
      { title: 'Test', status: 'pending' },
    ],
  })
})

test('refuses a plan the panel cannot show, saying why', async () => {
  expect(parsePlan(null)).toEqual({ error: 'input must be an object with a steps array' })
  expect(parsePlan({ steps: 'x' })).toEqual({ error: 'steps must be an array' })
  expect(parsePlan({ steps: [{ title: '', status: 'done' }] })).toEqual({ error: 'step 1 needs a title' })
  expect(parsePlan({ steps: [{ title: 'a', status: 'doing' }] })).toEqual({
    error: 'step 1 has status "doing"; use pending, in_progress or done',
  })
})

test('progress, the summary the model reads back, and the bar', async () => {
  const steps = [
    { title: 'a', status: 'done' as const },
    { title: 'b', status: 'in_progress' as const },
    { title: 'c', status: 'pending' as const },
  ]

  expect(progress(steps)).toEqual({ done: 1, total: 3, current: steps[1], isFinished: false })
  expect(summary(steps)).toBe('Plan updated: 1/3 done, now: b.')
  expect(progress(steps.map(s => ({ ...s, status: 'done' as const }))).isFinished).toBe(true)
  expect(bar(1, 4, 8)).toBe('██░░░░░░')
})
