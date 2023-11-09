import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import { env } from 'process';

puppeteer.use(StealthPlugin());

async function loginToGoogle(page) {
  await page.goto('https://accounts.google.com/');
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', env.GUSER);


  await Promise.all([
    page.waitForNavigation(),
    page.keyboard.press('Enter'),
  ]);
  await page.waitForSelector('input[type="password"]', { visible: true });
  await page.type('input[type="password"]', env.GPASS);
  await Promise.all([
    page.waitForNavigation(),
    page.keyboard.press('Enter'),
  ]);
}

async function readInterests(file) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return data.split('\n').filter(Boolean);
  } catch (err) {
    console.error(`Error reading file from disk: ${err}`);
    return [];
  }
}

async function simulateUserActions(page, interests) {
  // Assume loginToGoogle() has been called earlier to log in

  for (const interest of interests) {
    // Navigate to Google's homepage
    await page.goto('https://www.google.com/', { waitUntil: 'networkidle2' });

    // Check if the search input is available
    try {
      await page.waitForSelector('textarea[name="q"]', { visible: true, timeout: 5000 });
      
    } catch (error) {
      console.error(`Search input not found: ${error}`);
      await page.screenshot({ path: 'error-screenshot.png' }); // Take a screenshot for debugging
      throw new Error('Search input not found, aborting.');
    }

    // Type the interest into the search box
    await page.type('textarea[name="q"]', interest);

    // Wait for results page to load after submitting the search
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.keyboard.press('Enter'),
    ]);

    // Log the search
    console.log(`Searched for: ${interest}`);

    // Clear the input
    await page.evaluate(() => document.querySelector('textarea[name="q"]').value = '');
    
  }

  // Close the browser
  await page.browser().close();
}


async function main() {
  // Launch a browser and create a new page
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Set extra HTTP headers
  await page.setExtraHTTPHeaders({
    'accept-language': 'en-US,en;q=0.9',
  });

  // Log in to Google
  await loginToGoogle(page);

  // Read interests from file
  const interests = await readInterests('./interest-gamer.txt');

  // Simulate user actions with the page and interests
  await simulateUserActions(page, interests);

  // Close the browser when done
  await browser.close();
}

main().catch(console.error);