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
    console.log('No accounts with register: yes found. Recopying tempmail.json from Creator...');
    try {
      await fs.copyFile(sourcePath, renamedPath);
      const data = await fs.readFile(renamedPath, 'utf8');
      accounts = JSON.parse(data);
      console.log('Successfully recopied Creator/tempmail_accounts.json ➜ tempmail.json');

      // Re-filter after reloading
      const refreshedAccounts = Object.values(accounts).filter(a => a.register === 'yes');
      if (refreshedAccounts.length === 0) {
        console.error('Still no accounts with register: yes after recopying.');
        return;
      }
    } catch (copyError) {
      console.error('Error recopying tempmail.json:', copyError);
      return;
    }
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
    await page.goto('https://audius.co/signin', { waitUntil: 'load', timeout: 60000 });
    await page.fill('input[aria-label="Email"]', selectedAccount.address);
    await page.fill('input[aria-label="Password"]', selectedAccount.password);

    // === NEW: Add delay before clicking Sign In ===
    console.log('Waiting 3s before clicking Sign In button...');
    await page.waitForTimeout(3000);
    await page.click('//*[@id="root"]/div[1]/div/div[1]/div/form/div[4]/button');

    try {
      await page.waitForURL('https://audius.co/signin/confirm-email', { waitUntil: 'load', timeout: 60000 });
    } catch (error) {
      console.error('Warning: Timeout waiting for confirm-email page, continuing:', error.message);
    }

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

    // === NEW: Add delay before clicking OTP submit ===
    console.log('Waiting 3s before clicking Confirm button...');
    await page.waitForTimeout(3000);
    await page.click('//*[@id="root"]/div[1]/div/div[1]/form/div[3]/button');

    try {
      await page.waitForURL('https://audius.co/feed', { waitUntil: 'load', timeout: 60000 });
    } catch (error) {
      console.error('Warning: Timeout waiting for feed page:', error.message);
      const currentUrl = page.url();
      if (!currentUrl.includes('https://audius.co/feed')) {
        console.error('Failed to reach feed page, current URL:', currentUrl);
        await browser.close();
        return;
      }
    }

    let targetUrl;
    try {
      targetUrl = (await fs.readFile(path.join(__dirname, 'url.txt'), 'utf8')).trim();
      if (!targetUrl.startsWith('http')) throw new Error('Invalid URL format in url.txt');
      console.log('Loaded target URL from url.txt:', targetUrl);
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 60000 });
    } catch (error) {
      console.error('Error reading or navigating to url.txt:', error.message);
      await browser.close();
      return;
    }

    // --- FOLLOW BUTTON SEQUENCE ---
try {
  const followButton = page.locator('button.harmony-14k6qs7');
  const spanText = await followButton.locator('span.harmony-r9mewv').textContent();

  if (spanText && spanText.trim() === 'Follow') {
    console.log('Follow button found, clicking...');
    await followButton.click({ delay: Math.floor(Math.random() * 200) + 50 });
    console.log('Waiting 5s after follow click...');
    await page.waitForTimeout(5000);
  } else if (spanText && spanText.trim() === 'Following') {
    console.log('Already following, skipping click.');
  } else {
    console.log('Unexpected button text or button missing text:', spanText);
  }
} catch (error) {
  console.error('Error handling follow button:', error.message);
}

// --- POPUP DETECTION AND BUTTON CLICK ---
try {
  console.log('Looking for popup container...');

  const popupRoot = page.locator('div._root_i58yq_1');
  await popupRoot.waitFor({ state: 'visible', timeout: 60000 });
  console.log('Popup root detected.');

  const popupContent = popupRoot.locator('div._popup_i58yq_7._popup_1isr1_1.harmony-q98mk2');
  await popupContent.waitFor({ state: 'visible', timeout: 60000 });
  console.log('Inner popup container found.');

  const innerButton = popupContent.locator('button.harmony-14k6qs7');
  const buttonCount = await innerButton.count();

  if (buttonCount > 0) {
    console.log('Found target button inside popup, clicking...');
    await innerButton.first().click({ delay: Math.floor(Math.random() * 200) + 50 });
    console.log('Popup button clicked successfully.');
  } else {
    console.log('Target button not found inside popup content.');
  }
} catch (error) {
  console.error('Error interacting with popup button:', error.message);
  await browser.close();
  return;
}

   // --- Human-like clicking behavior ---  
try {  
  console.log('Locating main container: <div class="harmony-1iqhatc"> ...');  
  const container = await page.$('div.harmony-1iqhatc');  
  if (!container) {  
    console.log('Container not found.');  
  } else {  
    const repeatCount = 3;  
    for (let round = 1; round <= repeatCount; round++) {  
      console.log(`\n=== Starting interaction round ${round}/${repeatCount} ===`);  
      let listItems = await page.$$('div.harmony-1iqhatc ol li');  
      console.log(`Found ${listItems.length} <li> elements inside the target container.`);  

      if (listItems.length === 0) continue;  

      for (let i = 0; i < listItems.length; i++) {  
        try {  
          listItems = await page.$$('div.harmony-1iqhatc ol li');  
          if (i >= listItems.length) break;  

          const li = listItems[i];  
          await li.scrollIntoViewIfNeeded();  
          console.log(`Scrolled to item ${i + 1}/${listItems.length} (Round ${round})`);  
          await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);  

          const box = await li.boundingBox();  
          if (box) {  
            const x = box.x + box.width / 2 + (Math.random() * 10 - 5);  
            const y = box.y + box.height / 2 + (Math.random() * 10 - 5);  
            await page.mouse.move(x, y, { steps: 10 });  
          }  

          const circle = await li.$('svg circle#Oval');  
          if (circle) {  
            console.log(`Clicking circle in item ${i + 1}`);  
            await circle.click({ delay: Math.floor(Math.random() * 200) + 50 });  

            try {  
              const heartDiv = await li.$('div._heartWrapper_1nr0t_44');  
              if (heartDiv) {  
                const ariaLabel = await heartDiv.getAttribute('aria-label');  
                if (ariaLabel === 'Favorite') {  
                  console.log(`Heart button found (Favorite) in item ${i + 1}, clicking...`);  
                  await heartDiv.click({ delay: Math.floor(Math.random() * 200) + 50 });  
                } else if (ariaLabel === 'Unfavorite') {  
                  console.log(`Heart button in item ${i + 1} is already "Unfavorite", skipping click.`);  
                } else {  
                  console.log(`Heart button found in item ${i + 1} but aria-label is unexpected: ${ariaLabel}`);  
                }  
              } else {  
                console.log(`No heart button found in item ${i + 1}.`);  
              }  
            } catch (heartError) {  
              console.error(`Error handling heart button in item ${i + 1}: ${heartError.message}`);  
            }  
          } else {  
            console.log(`Circle not found in item ${i + 1}, skipping.`);  
          }  

          const popup = await page.$('div[role="dialog"], div.modal, div.popup');  
          if (popup) {  
            console.log('Popup detected, attempting to close...');  
            try {  
              await page.keyboard.press('Escape');  
              await popup.evaluate(el => el.remove());  
              console.log('Popup closed/removed.');  
            } catch (err) {  
              console.log('Error closing popup:', err.message);  
            }  
          }  

          const waitTime = Math.floor(Math.random() * 15000) + 5000;  
          console.log(`Waiting ${waitTime / 1000}s before next interaction...`);  
          await page.waitForTimeout(waitTime);  
        } catch (innerError) {  
          console.error(`Error on item ${i + 1} (Round ${round}): ${innerError.message}`);  
        }  
      }  

      console.log(`=== Completed round ${round}/${repeatCount} ===`);  
      if (round < repeatCount) {  
        const delay = Math.floor(Math.random() * 20000) + 10000;  
        console.log(`Waiting ${delay / 1000}s before restarting...`);  
        await page.waitForTimeout(delay);  
      }  
    }  
    console.log('\nAll interaction rounds completed successfully.');  
  }  
} catch (error) {  
  console.error('Error during human-like clicking sequence:', error.message);  
}  

await page.waitForTimeout(10000);  
await browser.close();  
} catch (globalError) {  
console.error('Fatal error in script:', globalError.message);  
await browser.close();  
}  
})();