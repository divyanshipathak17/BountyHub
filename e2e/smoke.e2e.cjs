/**
 * Browser smoke test: 3 isolated sessions (student + 2 mentors) drive the full flow.
 * Prerequisite: API on :5000 and client on :5173 are running.
 *   npm install && npx playwright install chromium && npm test
 * Screenshots are written to e2e/screenshots/.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = path.join(__dirname, 'screenshots');
fs.mkdirSync(out, { recursive: true });
const URL = process.env.APP_URL || 'http://localhost:5173';
const stamp = Date.now();
const TITLE = `Debug my Docker container #${String(stamp).slice(-5)}`;

(async () => {
  const browser = await chromium.launch();
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
    return p;
  };
  const student = await mk();
  const mentor = await mk();
  const mentor2 = await mk();

  async function register(p, { name, email, role, skills }) {
    await p.goto(URL);
    await p.getByRole('tab', { name: 'Create account' }).click();
    await p.getByLabel('Name').fill(name);
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Password').fill('password123');
    await p.getByLabel(role === 'mentor' ? 'Mentor' : 'Student').check();
    if (skills) await p.getByLabel('Your skills').fill(skills);
    await p.getByRole('button', { name: 'Create account' }).click();
    await p.getByText('Sign out').waitFor();
  }

  await student.goto(URL);
  await student.screenshot({ path: `${out}/01-auth.png` });

  await register(mentor, { name: 'Ravi', email: `ravi+${stamp}@x.com`, role: 'mentor', skills: 'docker, node' });
  await register(mentor2, { name: 'Meera', email: `meera+${stamp}@x.com`, role: 'mentor', skills: 'docker' });
  await register(student, { name: 'Asha', email: `asha+${stamp}@x.com`, role: 'student' });

  await student.getByLabel('Title').fill(TITLE);
  await student.getByLabel('Details').fill('Need someone to help me debug my Docker container in the next 2 hours. It exits with code 137.');
  await student.getByLabel('Skills needed').fill('docker');
  await student.getByLabel('Reward (tokens)').fill('15');
  await student.getByRole('button', { name: 'Post bounty' }).click();
  await student.getByText('Bounty posted').waitFor();
  await student.screenshot({ path: `${out}/02-student-posted.png` });
  console.log('student balance:', await student.locator('.balance').innerText());

  // Real-time push to mentors
  await mentor.getByText(`New bounty: ${TITLE}`).waitFor({ timeout: 5000 });
  await mentor2.getByText(`New bounty: ${TITLE}`).waitFor({ timeout: 5000 });
  await mentor.screenshot({ path: `${out}/03-mentor-push.png` });
  console.log('push received by both mentors');

  // Race: both accept at once
  await Promise.all([
    mentor.locator('.card', { hasText: TITLE }).getByRole('button', { name: 'Accept bounty' }).click(),
    mentor2.locator('.card', { hasText: TITLE }).getByRole('button', { name: 'Accept bounty' }).click(),
  ]);
  await Promise.race([mentor.waitForURL(/rooms/, { timeout: 5000 }), mentor2.waitForURL(/rooms/, { timeout: 5000 })]);
  await new Promise((r) => setTimeout(r, 800));
  const winner = /rooms/.test(mentor.url()) ? mentor : mentor2;
  const loser = winner === mentor ? mentor2 : mentor;
  console.log('winner:', winner === mentor ? 'Ravi' : 'Meera', '| loser url:', loser.url());
  await loser.screenshot({ path: `${out}/04-loser.png` });

  // Student gets notified and joins
  await student.getByRole('button', { name: 'Join room' }).click();
  await student.waitForURL(/rooms/);
  await student.getByText('Time left').waitFor();

  await winner.getByLabel('Message').fill('Hi! Run `docker logs <id>` and paste the output in the scratchpad.');
  await winner.getByRole('button', { name: 'Send' }).click();
  await student.getByText(/docker logs/).first().waitFor({ timeout: 5000 });
  await student.getByLabel('Shared notes').fill('Killed: OOM\nexit code 137');
  await winner.getByLabel('Shared notes').evaluate((el) => new Promise((r) => {
    const check = () => (el.value.includes('OOM') ? r() : setTimeout(check, 100));
    check();
  }));
  await student.getByLabel('Message').fill('Done, pasted it!');
  await student.getByRole('button', { name: 'Send' }).click();
  await winner.getByText('Done, pasted it!').waitFor();
  console.log('chat + notes synced live');
  await winner.screenshot({ path: `${out}/05-room-mentor.png` });
  await student.screenshot({ path: `${out}/06-room-student.png` });

  await student.getByRole('button', { name: 'Mark complete & pay' }).click();
  await winner.getByText('Session closed').waitFor({ timeout: 5000 });
  await new Promise((r) => setTimeout(r, 500));
  console.log('mentor balance after complete:', await winner.locator('.balance').innerText());
  console.log('composer disabled after close:', await winner.getByLabel('Message').isDisabled());
  await winner.screenshot({ path: `${out}/07-room-closed.png` });

  await student.goto(URL);
  await student.locator('.card', { hasText: TITLE }).getByText('Completed').waitFor();
  await student.screenshot({ path: `${out}/08-student-history.png` });

  // Mobile layout
  await student.setViewportSize({ width: 390, height: 844 });
  await student.screenshot({ path: `${out}/09-mobile.png`, fullPage: true });

  await browser.close();
  console.log('E2E OK');
})().catch((e) => {
  console.error('E2E FAILED', e);
  process.exit(1);
});
