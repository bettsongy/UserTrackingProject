import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import { env } from 'process';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();



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

async function interceptRequests(page) {
  const requestsData = [];
  await page.setRequestInterception(true);

  page.on('request', request => {
  // Collect request data with a timestamp
  requestsData.push({
    url: request.url(),
    method: request.method(),
    headers: filterHeaders(request.headers()),
    postData: request.postData(),
    timestamp: new Date().toISOString(), // MongoDB-compatible date format
  });
  request.continue();
});

  page.on('response', async response => {
    const request = response.request();
    const status = response.status();
    if (!status.toString().startsWith('3') && response.ok()) {
      try {
        if (!response.bodyUsed) {
          const responseBody = await response.text();
          // Push essential response details
          requestsData.push({
            url: request.url(),
            status: status,
            headers: filterHeaders(response.headers()),
            postData: request.postData(), // Only if it's relevant
            // responseBody: responseBody, // Be cautious with sensitive data
          });
        }
      } catch (error) {
        console.error(`Error reading response body for ${response.url()}: ${error}`);
      }
    }
  });

  return requestsData;
}

function filterHeaders(headers) {
  // Define headers that are relevant for tracking
  const relevantHeaders = ['cookie', 'set-cookie', 'authorization', 'x-client-data', 'referer'];
  return Object.keys(headers)
    .filter(key => relevantHeaders.includes(key.toLowerCase()))
    .reduce((obj, key) => {
      obj[key] = headers[key];
      return obj;
    }, {});
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

}



async function main() {
  // Retrieve connection details from environment variables
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;
  const collectionName = process.env.MONGODB_COLLECTION;

  // Connect to MongoDB
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    //... rest of your code for puppeteer

    const networkData = await interceptRequests(page);
    await loginToGoogle(page);

    const interests = await readInterests('./interest-gamer.txt');
    await simulateUserActions(page, interests);

    // Insert network data into MongoDB
    if (networkData.length > 0) {
      const result = await collection.insertMany(networkData);
      console.log(`${result.insertedCount} documents were inserted`);
    } else {
      console.log('No data to insert');
    }

    await browser.close();
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}




main().catch(console.error);