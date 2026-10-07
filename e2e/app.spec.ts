import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// `?embedder=hash` skips the 23 MB model download so these tests are fast and offline-safe.
const open = async (page: Page) => {
  await page.goto('/?embedder=hash')
  await expect(page.getByRole('list', { name: 'Documents' }).getByRole('listitem')).toHaveCount(12)
}
const ask = async (page: Page, q: string) => {
  await page.getByLabel('Ask a question').fill(q)
  await page.getByRole('button', { name: 'Send' }).click()
}

test('starts with the handbook indexed and suggestions to try', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('heading', { name: /What would you like to know/ })).toBeVisible()
  await expect(page.getByText('12 docs · 79 chunks')).toBeVisible()
  await expect(page.getByText('Lightweight search')).toBeVisible()
})

test('answers with citations, shows sources, and a citation click reaches its source', async ({ page }) => {
  await open(page)
  await ask(page, 'How many weeks of paid parental leave do birth parents get?')
  const answer = page.getByTestId('answer')
  await expect(answer).toContainText('16 weeks')
  const cite = answer.getByRole('button', { name: /Source 1/ }).first()
  await expect(cite).toBeVisible()
  await expect(page.getByText('Sources', { exact: true })).toBeVisible()
  await expect(page.locator('#src-1')).toContainText('Parental Leave')
  await cite.click()
  await expect(page.locator('#src-1')).toHaveClass(/flash/)
})

test('declines a question the handbook cannot answer', async ({ page }) => {
  await open(page)
  // keyword mode is deterministic regardless of which embedder is loaded
  await page.getByRole('radio', { name: 'Keyword' }).first().click()
  await ask(page, 'What is the capital of France?')
  await expect(page.getByTestId('declined')).toContainText('not in the handbook')
  await expect(page.getByText('Sources', { exact: true })).toHaveCount(0)
})

test('the retrieval mode is honoured and the inspector explains the result', async ({ page }) => {
  await open(page)
  await page.getByRole('radio', { name: 'Keyword' }).first().click()
  await ask(page, 'doctor note sick leave')
  await expect(page.getByTestId('answer')).toContainText(/3 consecutive working days/)
  await page.getByRole('button', { name: /how this was found/i }).click()
  const inspector = page.getByTestId('inspector')
  await expect(inspector).toContainText('keyword')
  await expect(inspector.getByRole('table')).toContainText('Sick and Medical Leave')
})

test('an uploaded markdown file becomes searchable and can be removed', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Add a document' }).click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/parking.md')
  const list = page.getByRole('list', { name: 'Documents' })
  await expect(list.getByText('Parking Policy')).toBeVisible()
  await ask(page, 'How much does it cost to charge an electric vehicle?')
  await expect(page.getByTestId('answer')).toContainText('12 cents')
  await expect(page.locator('#src-1')).toContainText('Parking Policy')
  await page.getByRole('button', { name: 'Remove Parking Policy' }).click()
  await expect(list.getByText('Parking Policy')).toHaveCount(0)
})

test('a text-based PDF can be uploaded and questioned', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Add a document' }).click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/pet-policy.pdf')
  await expect(page.getByRole('list', { name: 'Documents' }).getByText('Pet policy')).toBeVisible({ timeout: 20_000 })
  await ask(page, 'When must I tell facilities about bringing a dog?')
  await expect(page.getByTestId('answer')).toContainText('Thursday noon')
  await expect(page.locator('#src-1')).toContainText('page 1')
})

test('pasted text is indexed too, and bad uploads give a clear error', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Add a document' }).click()
  await page.getByRole('radio', { name: 'Paste text' }).click()
  await page.getByLabel('Title').fill('Gym policy')
  await page.getByLabel('Text').fill('## Gym\n\nThe on-site gym is open from 6am to 9pm every weekday for all employees.')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Documents' }).getByText('Gym policy')).toBeVisible()

  await page.getByRole('button', { name: 'Add a document' }).click()
  await page.getByTestId('file-input').setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') })
  await expect(page.getByRole('alert')).toContainText('Upload a .md, .txt or .pdf file.')
})

test('Claude mode sends the sources to the API and streams the reply back', async ({ page }) => {
  let body: { system: string; messages: { content: string }[]; model: string } | null = null
  let headers: Record<string, string> = {}
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    body = route.request().postDataJSON()
    headers = route.request().headers()
    const ev = (e: unknown) => `event: x\ndata: ${JSON.stringify(e)}\n\n`
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
      body: ev({ type: 'message_start' }) + ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Birth parents get **16 weeks** ' } }) + ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'of fully paid leave [1].' } }) + ev({ type: 'message_stop' }),
    })
  })
  await open(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  const key = page.getByLabel('Anthropic API key')
  await expect(key).toHaveAttribute('type', 'password')
  await key.fill('sk-ant-test-key')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Answers: Claude')).toBeVisible()

  await ask(page, 'How many weeks of paid parental leave do birth parents get?')
  await expect(page.getByTestId('answer')).toContainText('Birth parents get 16 weeks of fully paid leave')
  await expect(page.getByTestId('answer').locator('strong')).toHaveText('16 weeks')
  expect(headers['x-api-key']).toBe('sk-ant-test-key')
  expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  expect(body!.messages[0].content).toContain('<source n="1" document="Parental Leave"')
  expect(body!.system).toContain('Use ONLY the numbered sources')
  // the key is never persisted
  const stored = await page.evaluate(() => JSON.stringify(localStorage))
  expect(stored).not.toContain('sk-ant-test-key')
})

test('a failing Claude call shows an error and the app stays usable', async ({ page }) => {
  await page.route('https://api.anthropic.com/v1/messages', (route) => route.fulfill({ status: 401, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'invalid x-api-key' } }) }))
  await open(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Anthropic API key').fill('bad')
  await page.getByRole('button', { name: 'Done' }).click()
  await ask(page, 'How many weeks of paid parental leave do birth parents get?')
  await expect(page.getByRole('alert')).toContainText('invalid x-api-key')
  await ask(page, 'What is the learning budget?')
  await expect(page.getByTestId('user-message').last()).toHaveText('What is the learning budget?')
})

test('the evaluation page shows the measured results and can re-run them in the browser', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Evaluation' }).click()
  await expect(page.getByRole('heading', { name: 'Evaluation' })).toBeVisible()
  const results = JSON.parse(readFileSync('packages/core/eval/results.json', 'utf8'))
  const minilm = results.retrieval.find((r: { label: string }) => r.label === 'Semantic (MiniLM)')
  await expect(page.getByRole('row', { name: /Semantic \(MiniLM\)/ })).toContainText(`${Math.round(minilm.hitAt3 * 100)}%`)
  await page.getByRole('button', { name: 'Run on this browser' }).click()
  const live = page.getByTestId('live-eval')
  await expect(live).toBeVisible({ timeout: 60_000 })
  await expect(live.getByRole('row')).toHaveCount(52) // two header rows plus 50 questions
})

test('theme toggles and persists', async ({ page }) => {
  await open(page)
  const html = page.locator('html')
  const before = await html.getAttribute('data-theme')
  const next = before === 'dark' ? 'light' : 'dark'
  await page.getByRole('button', { name: new RegExp(`Switch to ${next} theme`) }).click()
  await expect(html).toHaveAttribute('data-theme', next)
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', next)
})

test('Escape closes dialogs and Enter in the composer sends', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('Ask a question').fill('What is the learning budget?')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('answer')).toContainText('$1,500')
})
