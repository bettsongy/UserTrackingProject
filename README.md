# Google User ID Tracking Investigation

## Overview

This project is designed to investigate whether Google tracks user IDs across different websites using Puppeteer to monitor and analyze web traffic and cookies. The investigation will utilize automated web crawling to collect data on network requests and cookie usage, specifically focusing on Google services.

## Setup

### Requirements

- Node.js
- Puppeteer
- Chrome or Chromium browser
- Consent-O-Matic extension (or similar)
- A database system (e.g., MySQL, MongoDB)

### Configuration

- Puppeteer should emulate realistic user behavior (user agent, viewport sizes).
- Chrome DevTools Protocol should be enabled for detailed network and cookie analysis.
- Install necessary browser extensions for handling consent automatically.

## Data Collection

1. **Crawl Strategy**: Visit a broad range of websites, possibly using the Tranco List, or focus on specific Google services.
2. **Consent Handling**: Use Consent-O-Matic to automatically set consent preferences.
3. **HTTP(S) Monitoring**: Log all network requests and responses, paying close attention to Google-related traffic.
4. **Cookie Tracking**: Document all cookies, with a focus on those set by Google domains.

## Data Analysis

1. **Identify Trackers**: Pinpoint all Google tracking mechanisms encountered during crawling.
2. **Cookie Scrutiny**: Examine the cookies for unique identifiers suggestive of user IDs.
3. **Request Correlation**: Look for correlations between cookie identifiers and network request parameters.
4. **Persistence Tracking**: Assess the persistence of user IDs across different sessions and websites.
5. **Transmission Analysis**: Investigate how user IDs are transmitted to Google servers.

## Reporting

1. **Compile Data**: Organize collected data to clearly show potential tracking activities.
2. **Detailed Report**: Produce a detailed report of the findings regarding Google's tracking behavior.
3. **Provide Recommendations**: Offer insights on privacy practices based on the investigation's outcomes.
4. **Publication**: Share the findings with the community for broader awareness and discussion.

## Compliance and Ethics

- Ensure all activities comply with relevant laws such as GDPR.
- Maintain ethical standards in data collection and analysis, respecting user privacy.

## Running the Project

```bash
# Install dependencies
npm install

# Run the crawler
node crawler.mjs

# Analyze the data
node analyze.mjs

# Generate the report
node report.mjs
