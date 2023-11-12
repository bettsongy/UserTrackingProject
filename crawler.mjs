import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import { env } from 'process';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();



puppeteer.use(StealthPlugin());

const CONCURRENCY_LIMIT = 5; // Limit of concurrent tabs/pages


async function runCrawlingProcess(page, interest, cdpClient, requestsData) {
  try {
    await interceptRequestsAndResponses(page, cdpClient, requestsData);
    await page.goto('https://www.google.com/', { waitUntil: 'networkidle2' });
    await page.waitForSelector('textarea[name="q"]', { visible: true, timeout: 5000 });
    await page.type('textarea[name="q"]', interest);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.keyboard.press('Enter'),
    ]);
    console.log(`Searched for: ${interest}`);
  } catch (error) {
    console.error(`Error with searching: ${interest}: ${error}`);
  }
}


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
            responseBody: responseBody, // Be cautious with sensitive data
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

function parseSetCookieHeader(setCookieStr) {
  let attributes = setCookieStr.split(';').map(attr => attr.trim());
  let cookieValue = attributes.shift();
  let cookieParts = cookieValue.split('=');
  let cookieObj = {
    name: cookieParts.shift(),
    value: cookieParts.join('='),
  };
  attributes.forEach(attr => {
    let [key, value] = attr.split('=');
    cookieObj[key.trim().toLowerCase()] = value ? value.trim() : true;
  });
  return cookieObj;
}

async function interceptRequestsAndResponses(page, client, requestsData) {
    await client.send('Network.enable');

    // Enhanced request interception
    client.on('Network.requestWillBeSent', event => {
        requestsData.push({
            type: 'request',
            url: event.request.url,
            method: event.request.method,
            headers: event.request.headers,
            postData: event.request.postData,
            timestamp: new Date(event.timestamp * 1000).toISOString(),
        });
    });

    // Enhanced response interception
    client.on('Network.responseReceived', async event => {
        try {
            let cookies = [];
            const responseHeaders = event.response.headers;

            // Check and parse 'set-cookie' headers if they are present
            if (responseHeaders['set-cookie']) {
                const setCookieHeaders = Array.isArray(responseHeaders['set-cookie'])
                    ? responseHeaders['set-cookie']
                    : [responseHeaders['set-cookie']];
                
                cookies = setCookieHeaders.map(header => parseSetCookieHeader(header));
            }

            let responseBody = '';
            if (event.response.bodySize > 0) {
                try {
                    // Attempt to get the response body
                    const response = await client.send('Network.getResponseBody', { requestId: event.requestId });
                    responseBody = response.body;
                } catch (e) {
                    // If there's an error, response body will be left as an empty string
                }
            }

            requestsData.push({
                type: 'response',
                url: event.response.url,
                status: event.response.status,
                headers: event.response.headers,
                cookies: cookies,
                responseBody: responseBody,
                timestamp: new Date(event.timestamp * 1000).toISOString(),
            });
        } catch (error) {
            console.error(`Error reading response for ${event.response.url}: ${error}`);
        }
    });
}


async function main() {
  // Load environment variables
  const uri = env.MONGODB_URI;
  const dbName = env.MONGODB_DB;
  const collectionName = env.MONGODB_COLLECTION;

  // Create MongoDB client and connect
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection(collectionName);

  // Launch browser
  const browser = await puppeteer.launch({ headless: false });

  // Perform crawling while logged in
  const pageLoggedIn = await browser.newPage();
  await loginToGoogle(pageLoggedIn); // Perform login
  const interests = await readInterests('./interest-gamer.txt');
  const networkDataLoggedIn = [];
  const cdpClientLoggedIn = await pageLoggedIn.target().createCDPSession();
  await simulateUserActions(pageLoggedIn, interests, cdpClientLoggedIn, networkDataLoggedIn);
  await cdpClientLoggedIn.send('Network.disable');

  // Store logged in data
  if (networkDataLoggedIn.length > 0) {
    const resultLoggedIn = await collection.insertMany(networkDataLoggedIn.map(data => ({ ...data, loggedIn: true })));
    console.log(`Logged in data: ${resultLoggedIn.insertedCount} documents were inserted`);
  } else {
    console.log('No logged in data to insert');
  }

  // Perform crawling without being logged in
  const pageLoggedOut = await browser.newPage();
  const networkDataLoggedOut = [];
  const cdpClientLoggedOut = await pageLoggedOut.target().createCDPSession();
  await simulateUserActions(pageLoggedOut, interests, cdpClientLoggedOut, networkDataLoggedOut);
  await cdpClientLoggedOut.send('Network.disable');

  // Store logged out data
  if (networkDataLoggedOut.length > 0) {
    const resultLoggedOut = await collection.insertMany(networkDataLoggedOut.map(data => ({ ...data, loggedIn: false })));
    console.log(`Logged out data: ${resultLoggedOut.insertedCount} documents were inserted`);
  } else {
    console.log('No logged out data to insert');
  }

  // Clean up
  await browser.close();
  await client.close();
}

main().catch(console.error);