import axios from 'axios';

const shop = 'ethnoirindia.myshopify.com';
const key = '0d89f381bc5dbd2e8527390a9a336308';
const secret = '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';

async function testAuth() {
  console.log('Testing Shopify connection for store:', shop);

  // Test 1: X-Shopify-Access-Token with secret
  try {
    const res1 = await axios.post(
      `https://${shop}/admin/api/2026-07/graphql.json`,
      { query: '{ shop { name } }' },
      { headers: { 'X-Shopify-Access-Token': secret } }
    );
    console.log('Test 1 (X-Shopify-Access-Token: secret): SUCCESS', res1.data);
    return;
  } catch (err) {
    console.log('Test 1 failed:', err.response?.status, err.response?.data || err.message);
  }

  // Test 2: Basic Auth (key:secret)
  try {
    const authHeader = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
    const res2 = await axios.post(
      `https://${shop}/admin/api/2026-07/graphql.json`,
      { query: '{ shop { name } }' },
      { headers: { Authorization: authHeader } }
    );
    console.log('Test 2 (Basic key:secret): SUCCESS', res2.data);
    return;
  } catch (err) {
    console.log('Test 2 failed:', err.response?.status, err.response?.data || err.message);
  }

  // Test 3: Client Credentials grant (for Shopify Partner / Dev Apps)
  try {
    const res3 = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: key,
        client_secret: secret,
        grant_type: 'client_credentials'
      }
    );
    console.log('Test 3 (client_credentials grant): SUCCESS', res3.data);
  } catch (err) {
    console.log('Test 3 failed:', err.response?.status, err.response?.data || err.message);
  }
}

testAuth();
