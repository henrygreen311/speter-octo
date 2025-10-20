const { firefox } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

(async () => {
  const sourcePath = path.join(__dirname, '../Creator', 'tempmail_accounts.json');
  const destPath = path.join(__dirname, 'tempmail_accounts.json');
  const renamedPath = path.join(__dirname, 'tempmail.json');
  let accounts;

  try {
    try {
      let data;
      try {
        data = await fs.readFile(renamedPath, 'utf8');
        console.log('Loaded existing tempmail.json');
      } catch {
        data = await fs.readFile(destPath, 'utf8');
        console.log('Loaded existing tempmail_accounts.json');
      }
      accounts = JSON.parse(data);
    } catch (error) {
      console.log('No local tempmail file found. Copying from Creator and renaming...');
      await fs.copyFile(sourcePath, renamedPath);
      const data = await fs.readFile(renamedPath, 'utf8');
      accounts = JSON.parse(data);
      console.log('Copied and renamed Creator/tempmail_accounts.json ➜ tempmail.json');
    }
  } catch (error) {
    console.error('Error handling tempmail files:', error);
    return;
  }

  const validAccounts = Object.values(accounts).filter(a => a.register === 'yes');
  if (validAccounts.length === 0) {
    console.log('No accounts with register: yes found');
    return;
  }

  const randomIndex = Math.floor(Math.random() * validAccounts.length);
  const selectedAccount = validAccounts[randomIndex];
  console.log(`Randomly selected account #${randomIndex + 1} of ${validAccounts.length}`);
  console.log('Selected email:', selectedAccount.address);
  console.log('Selected password:', selectedAccount.password);

  delete accounts[selectedAccount.address];
  await fs.writeFile(renamedPath, JSON.stringify(accounts, null, 2));

  let userAgent;
  try {
    const userAgents = await fs.readFile(path.join(__dirname, '../Creator', 'user_agents.txt'), 'utf8');
    const list = userAgents.split('\n').filter(u => u.trim());
    userAgent = list[Math.floor(Math.random() * list.length)];
    console.log('Selected user agent:', userAgent);
  } catch (error) {
    console.error('Error reading user_agents.txt:', error);
    return;
  }

  const browser = await firefox.launch({ headless: false });
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 720 },
    javaScriptEnabled: true,
    bypassCSP: true,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    }
  });

  const page = await context.newPage();

  await page.route('**/*', async route => {
    await new Promise(res => setTimeout(res, Math.random() * 100));
    route.continue();
  });

  try {
    // --- LOGIN SEQUENCE ---
    await page.goto('https://audius.co/signin', { waitUntil: 'domcontentloaded' });
    await page.fill('input[aria-label="Email"]', selectedAccount.address);
    await page.fill('input[aria-label="Password"]', selectedAccount.password);

    // Click and recheck submit
    const loginButton = page.locator('//*[@id="root"]/div[1]/div/div[1]/div/form/div[4]/button');
    console.log('Attempting to click Sign In button...');
    await loginButton.click({ delay: 100 });
    await page.waitForTimeout(2000);

    // Verify if button click triggered navigation or loading
    let loginClicked = false;
    for (let i = 0; i < 5; i++) {
      const url = page.url();
      if (!url.includes('/signin')) {
        loginClicked = true;
        break;
      }
      console.log('Rechecking Sign In button click, attempt', i + 1);
      await loginButton.click({ delay: 100 });
      await page.waitForTimeout(3000);
    }

    console.log(loginClicked ? 'Sign In confirmed.' : 'Proceeding despite uncertain click.');

    // Wait for confirm-email page
    try {
      await page.waitForURL('https://audius.co/signin/confirm-email', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      console.log('Navigated to confirm-email page.');
    } catch {
      console.log('Confirm-email page did not load after 1 minute.');
    }

    // --- OTP HANDLING ---
    let otp;
    try {
      const { stdout } = await execPromise(`python3 ../Creator/tempmail.py inbox ${selectedAccount.address}`);
      const otpMatch = stdout.match(/\d{3}\s\d{3}/);
      if (otpMatch) {
        otp = otpMatch[0];
        console.log('Retrieved OTP:', otp);
      } else {
        console.error('OTP not found in tempmail.py output');
        await browser.close();
        return;
      }
    } catch (error) {
      console.error('Error executing tempmail.py:', error);
      await browser.close();
      return;
    }

    await page.fill('input[aria-label="Code"]', otp);

    // Click and recheck confirm button
    const confirmButton = page.locator('//*[@id="root"]/div[1]/div/div[1]/form/div[3]/button');
    console.log('Attempting to click Confirm button...');
    await confirmButton.click({ delay: 100 });
    await page.waitForTimeout(2000);

    let confirmClicked = false;
    for (let i = 0; i < 5; i++) {
      const url = page.url();
      if (url.includes('/feed')) {
        confirmClicked = true;
        break;
      }
      console.log('Rechecking Confirm button click, attempt', i + 1);
      await confirmButton.click({ delay: 100 });
      await page.waitForTimeout(3000);
    }

    console.log(confirmClicked ? 'Confirm click validated.' : 'Proceeding to wait for feed page.');

    // Wait for feed page (up to 1 minute)
    try {
      await page.waitForURL('https://audius.co/feed', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      console.log('Feed page loaded successfully.');
    } catch {
      console.error('Feed page did not load after 1 minute.');
      const currentUrl = page.url();
      console.error('Current URL:', currentUrl);
      if (!currentUrl.includes('https://audius.co/feed')) {
        await browser.close();
        return;
      }
    }

    // --- LOAD TARGET PAGE ---
    let targetUrl;
    try {
      targetUrl = (await fs.readFile(path.join(__dirname, 'url.txt'), 'utf8')).trim();
      if (!targetUrl.startsWith('http')) throw new Error('Invalid URL format in url.txt');
      console.log('Loaded target URL from url.txt:', targetUrl);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      console.error('Error reading or navigating to url.txt:', error.message);
      await browser.close();
      return;
    }

    // (Your follow + interaction code continues here unchanged)
    // ...

    await page.waitForTimeout(10000);
    await browser.close();
  } catch (globalError) {
    console.error('Fatal error in script:', globalError.message);
    await browser.close();
  }
})();