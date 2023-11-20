import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import { env } from 'process';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

puppeteer.use(StealthPlugin());

const CONCURRENCY_LIMIT = 20; // Limit of concurrent tabs/pages

function getDomainFromUrl(url) {
  const hostname = new URL(url).hostname;
  return hostname.replace('www.', ''); // Remove 'www.' for consistency
}










async function insertData(collection, data) {
    if (data.length > 0) {
        const result = await collection.insertMany(data);
        console.log(`Data inserted: ${result.insertedCount} documents`);
    } else {
        console.log('No data to insert');
    }
}

async function runCrawlingProcess(page, interest, loggedIn, cdpClient, requestsData, userInterest) {
    try {
        await interceptRequestsAndResponses(page, cdpClient, requestsData, loggedIn, userInterest);
        await page.goto('https://www.google.com/', { waitUntil: 'networkidle2' });

        // Use textarea for Google's search field
        const searchTextareaSelector = 'textarea[name="q"]';

        try {
            await page.waitForSelector(searchTextareaSelector, { visible: true, timeout: 5000 });
            await page.type(searchTextareaSelector, interest);
        } catch (error) {
            console.error(`Error finding search field using selector ${searchTextareaSelector}: ${error}`);
            throw new Error('Google search field not found');
        }

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

async function processBatch(pages, batch, loggedIn) {
    const promises = [];

    for (let i = 0; i < batch.length; i++) {
        const interest = batch[i];
        const pageIndex = i % CONCURRENCY_LIMIT;
        const page = pages[pageIndex];

        const promise = (async () => {
            const cdpClient = await page.target().createCDPSession();
            const requestsData = [];
            await runCrawlingProcess(page, interest, loggedIn, cdpClient, requestsData, interest);
            await cdpClient.detach();
            return requestsData;
        })();

        promises.push(promise);
    }

    const results = await Promise.all(promises);
    return results.flat();
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

async function interceptRequestsAndResponses(page, client, requestsData, loggedIn, userInterest) {
    await client.send('Network.enable');

    client.on('Network.requestWillBeSent', event => {
        requestsData.push({
            sessionInfo: {
                loggedIn: loggedIn,
                userInterest: userInterest,
                website: getDomainFromUrl(event.request.url),
            },
            type: 'request',
            url: event.request.url,
            method: event.request.method,
            headers: event.request.headers,
            postData: event.request.postData,
            timestamp: new Date().toISOString(), // Current timestamp
        });
    });

    client.on('Network.responseReceived', async event => {
        try {
            let cookies = [];
            const responseHeaders = event.response.headers;

            if (responseHeaders['set-cookie']) {
                const setCookieHeaders = Array.isArray(responseHeaders['set-cookie'])
                    ? responseHeaders['set-cookie']
                    : [responseHeaders['set-cookie']];
                
                cookies = setCookieHeaders.map(header => parseSetCookieHeader(header));
            }

            let responseBody = '';
            if (event.response.bodySize > 0 && !event.response.headers['content-encoding']) {
                try {
                    const response = await client.send('Network.getResponseBody', { requestId: event.requestId });
                    responseBody = response.body;
                } catch (e) {
                    console.error(`Error getting response body for ${event.response.url}: ${e}`);
                }
            }

            requestsData.push({
                sessionInfo: {
                    loggedIn: loggedIn,
                    userInterest: userInterest,
                    website: getDomainFromUrl(event.response.url),
                },
                type: 'response',
                url: event.response.url,
                status: event.response.status,
                headers: event.response.headers,
                cookies: cookies,
                responseBody: responseBody,
                timestamp: new Date().toISOString(), // Current timestamp
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
    const interests = await readInterests('./interest-gamer.txt');

    // Create pages up to the concurrency limit
    let pages = await Promise.all(
        Array.from({ length: CONCURRENCY_LIMIT }, () => browser.newPage())
    );

    // Login for the first batch (logged-in scenario)
    await loginToGoogle(pages[0]);
    for (let i = 0; i < interests.length; i += CONCURRENCY_LIMIT) {
        const batch = interests.slice(i, i + CONCURRENCY_LIMIT);
        const networkDataLoggedIn = await processBatch(pages, batch, true);
        await insertData(collection, networkDataLoggedIn);
    }

    // Close and reopen pages for the logged-out scenario
    await Promise.all(pages.map(page => page.close()));
    pages = await Promise.all(
        Array.from({ length: CONCURRENCY_LIMIT }, () => browser.newPage())
    );

    for (let i = 0; i < interests.length; i += CONCURRENCY_LIMIT) {
        const batch = interests.slice(i, i + CONCURRENCY_LIMIT);
        const networkDataLoggedOut = await processBatch(pages, batch, false);
        await insertData(collection, networkDataLoggedOut);
    }

    // Clean up
    await Promise.all(pages.map(page => page.close()));
    await browser.close();
    await client.close();
}

main().catch(console.error);