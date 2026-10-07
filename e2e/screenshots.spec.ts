import { expect, test, type Page } from '@playwright/test'

// Run with: npm run screenshots (downloads the 23 MB search model once, so allow a few minutes)
test.skip(!process.env.SCREENSHOTS, 'screenshot generation only')
test.setTimeout(420_000)
test.use({ viewport: { width: 1360, height: 860 }, colorScheme: 'dark' })

const shot = (page: Page, name: string, full = false) => page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: full })
const ask = async (page: Page, q: string) => {
  await page.getByLabel('Ask a question').fill(q)
  await page.getByRole('button', { name: 'Send' }).click()
}

test('capture', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(800)
  await shot(page, 'empty')

  await expect(page.getByText('Neural search ready')).toBeVisible({ timeout: 360_000 })
  await ask(page, 'Can I take a day off for Diwali?')
  await expect(page.getByTestId('answer')).toContainText('floating holiday')
  await page.waitForTimeout(500)
  await shot(page, 'answer')
  await page.getByRole('button', { name: /how this was found/i }).click()
  await page.waitForTimeout(300)
  await page.getByTestId('inspector').scrollIntoViewIfNeeded()
  await shot(page, 'inspector')

  await ask(page, 'How much equity do new engineers receive?')
  await expect(page.getByTestId('declined')).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, 'declined')

  await page.getByRole('button', { name: 'Evaluation' }).click()
  await page.getByRole('button', { name: 'Run on this browser' }).click()
  await expect(page.getByTestId('live-eval').getByRole('row')).toHaveCount(52, { timeout: 120_000 })
  await page.waitForTimeout(600)
  await shot(page, 'eval', true)

  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.waitForTimeout(400)
  await shot(page, 'settings')
  await page.keyboard.press('Escape')

  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await page.waitForTimeout(500)
  await shot(page, 'answer-light')
})
