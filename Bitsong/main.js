const { firefox } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

(async () => {
  const url = 'https://app.bitsong.io/signin';
  const sourcePath = path.join(__dirname, 'tempmail_accounts.json');
  const destPath = path.join(__dirname, 'tempmail_accounts.json');
  const renamedPath = path.join(__dirname, 'tempmail.json');
  let accounts;

  // === Handle tempmail files ===
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
      console.log('No local tempmail file found. Copying and renaming...');
      await fs.copyFile(sourcePath, renamedPath);
      const data = await fs.readFile(renamedPath, 'utf8');
      accounts = JSON.parse(data);
      console.log('Copied and renamed tempmail_accounts.json ➜ tempmail.json');
    }
  } catch (error) {
    console.error('Error handling tempmail files:', error);
    return;
  }

  let validAccounts = Object.values(accounts).filter(a => a.register === 'yes');

  if (validAccounts.length === 0) {
    console.log('No accounts with register: yes found. Recopying tempmail.json...');
    try {
      await fs.copyFile(sourcePath, renamedPath);
      const data = await fs.readFile(renamedPath, 'utf8');
      accounts = JSON.parse(data);
      console.log('Successfully recopied tempmail_accounts.json ➜ tempmail.json');

      const refreshedAccounts = Object.values(accounts).filter(a => a.register === 'yes');
      if (refreshedAccounts.length === 0) {
        console.error('Still no accounts with register: yes after recopying.');
        return;
      }
      validAccounts = refreshedAccounts;
    } catch (copyError) {
      console.error('Error recopying tempmail.json:', copyError);
      return;
    }
  }

  const randomIndex = Math.floor(Math.random() * validAccounts.length);
  const selectedAccount = validAccounts[randomIndex];
  console.log(`Randomly selected account #${randomIndex + 1} of ${validAccounts.length}`);
  console.log('Selected email:', selectedAccount.address);

  delete accounts[selectedAccount.address];
  await fs.writeFile(renamedPath, JSON.stringify(accounts, null, 2));

  // === Randomly select User-Agent ===
  let userAgent;
  try {
    const userAgents = await fs.readFile(path.join(__dirname, 'user_agents.txt'), 'utf8');
    const list = userAgents.split('\n').filter(u => u.trim());
    userAgent = list[Math.floor(Math.random() * list.length)];
    console.log('Selected User-Agent:', userAgent);
  } catch (error) {
    console.error('Error reading user_agents.txt:', error);
    return;
  }

  // === Playwright Automation ===
  const browser = await firefox.launch({ headless: false });
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();

  try {
    console.log(`Opening ${url}...`);
    await page.goto(url, { waitUntil: 'load' });
    console.log('Page fully loaded.');

    await page.waitForLoadState('networkidle');
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });

    // Enter email
    await page.fill('input[type="email"]', selectedAccount.address);
    console.log('Entered email into form.');
    await page.waitForTimeout(2000);

    // Click "Sign in"
    await page.click('button:has-text("Sign in")');
    console.log('Clicked Sign in button.');

    // Wait for OTP
    console.log('Waiting 8 seconds for OTP email to arrive...');
    await page.waitForTimeout(8000);

    // === Retrieve OTP via Python script ===
    let otp;
    try {
      console.log('Running tempmail.py to retrieve OTP...');
      const { stdout } = await exec(`python3 tempmail.py inbox ${selectedAccount.address}`);
      const otpMatch = stdout.match(/\d{6}/);
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

    // === Enter OTP ===
    await page.waitForSelector('#verification-code', { timeout: 15000 });
    await page.fill('#verification-code', otp);
    console.log('Entered OTP into verification field.');

    // Click "Verify & Login"
    await page.click('button:has-text("Verify & Login")');
    console.log('Clicked Verify & Login button.');

    // Wait for the main dashboard to load
    await page.waitForTimeout(5000);

    // Navigate to dashboard
    console.log('Navigating to main dashboard...');
    await page.goto('https://app.bitsong.io/', { waitUntil: 'load' });
    console.log('Opened https://app.bitsong.io/');

    // Navigate to user profile page
    await page.waitForTimeout(2000);
    await page.goto('https://app.bitsong.io/u/bitsong139sm52086lvlnat5u9cfkk2gtqql2dszp0l2dl', { waitUntil: 'load' });
    console.log('Opened user profile page.');

    // === Wait for DOMContentLoaded ===
    await page.waitForLoadState('domcontentloaded');
    console.log('DOM fully loaded.');

    // === Step 1: Look for Follow button ===
    const followButton = await page.$('button:has-text("Follow")');
    const followingButton = await page.$('button:has-text("Following")');

    if (followButton) {
      console.log('Found Follow button, clicking...');
      await followButton.click();
      await page.waitForTimeout(2000);
    } else if (followingButton) {
      console.log('User already following. Skipping...');
    } else {
      console.log('Follow button not found. Skipping...');
    }

    // === Step 2: Locate parent container ===
    const containerXpath = '/html/body/div[1]/div[2]/main/div/div[2]/div/div[1]/div/div[2]';
    const container = await page.$(`xpath=${containerXpath}`);

    if (!container) {
      console.log('Container not found. Skipping list processing.');
      return;
    }

    // === Step 3: Find all target divs ===
    let allDivs = await container.$$('div.group.rounded-lg.grid.items-center');

    if (allDivs.length === 0) {
      console.warn('⚠️ No divs found with CSS selector. Trying XPath fallback...');
      allDivs = await page.$$(
        '/html/body/div[1]/div[2]/main/div/div[2]/div/div[1]/div/div[2]/div/div'
      );
    }

    console.log(`Found ${allDivs.length} target div(s).`);

    // === Step 4: Loop 4 full cycles ===
    const totalCycles = 4;

    for (let cycle = 1; cycle <= totalCycles; cycle++) {
      console.log(`🔁 Starting cycle ${cycle}/${totalCycles}...`);

      for (let i = 0; i < allDivs.length; i++) {
        try {
          const buttonXpath = `/html/body/div[1]/div[2]/main/div/div[2]/div/div[1]/div/div[2]/div/div[${i + 1}]/div[1]/button`;
          const button = await page.$(`xpath=${buttonXpath}`);
          if (button) {
            console.log(`Cycle ${cycle} → Clicking button in div ${i + 1}/${allDivs.length}`);
            await button.click();
          } else {
            console.log(`Cycle ${cycle} → Button not found in div ${i + 1}, skipping...`);
          }

          const waitTime = Math.floor(Math.random() * (20000 - 5000 + 1)) + 5000;
          console.log(`Waiting ${waitTime / 1000}s before next action...`);
          await page.waitForTimeout(waitTime);
        } catch (err) {
          console.log(`Error processing div ${i + 1} in cycle ${cycle}:`, err.message);
        }
      }

      console.log(`✅ Completed cycle ${cycle}/${totalCycles}`);
      if (cycle < totalCycles) {
        console.log('Restarting loop from first div...');
      } else {
        console.log('All cycles complete. Exiting...');
      }
    }

  } catch (error) {
    console.error('Error during page interaction:', error);
  } finally {
    console.log('🔚 Script finished all operations.');
    await browser.close();
  }
})();