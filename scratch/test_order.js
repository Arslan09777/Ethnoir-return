import axios from 'axios';

const shop = 'ethnoirindia.myshopify.com';
const token = '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';

async function fetchOrder() {
  const query = `
    query searchOrders($q: String!) {
      orders(first: 10, query: $q) {
        nodes {
          id
          name
          displayFinancialStatus
          displayFulfillmentStatus
          createdAt
          customer {
            firstName
            lastName
            email
            phone
          }
          shippingAddress {
            name
            phone
            address1
            city
            province
            zip
          }
          lineItems(first: 20) {
            nodes {
              id
              title
              quantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  `;

  // Search by 1124 or ET-1124
  for (const q of ['name:1124', 'name:ET-1124', '1124', 'ET-1124']) {
    console.log(`\n--- Searching with query: "${q}" ---`);
    try {
      const res = await axios.post(
        `https://${shop}/admin/api/2026-07/graphql.json`,
        { query, variables: { q } },
        { headers: { 'X-Shopify-Access-Token': token } }
      );
      const orders = res.data.data?.orders?.nodes || [];
      console.log(`Found ${orders.length} orders:`);
      orders.forEach(o => {
        console.log(`- Order: ${o.name} | Customer: ${o.customer?.firstName} ${o.customer?.lastName} | Email: ${o.customer?.email} | Phone: ${o.customer?.phone || o.shippingAddress?.phone} | Status: ${o.displayFulfillmentStatus}`);
      });
    } catch (err) {
      console.error('Query error:', err.response?.data || err.message);
    }
  }

  // Also fetch the last 5 orders from the store to see actual order name formatting!
  console.log('\n--- Fetching last 5 recent orders from store to see format ---');
  try {
    const res = await axios.post(
      `https://${shop}/admin/api/2026-07/graphql.json`,
      { query: `{ orders(first: 5) { nodes { id name customer { email phone } shippingAddress { phone } displayFulfillmentStatus createdAt } } }` },
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    console.log('Recent orders:', JSON.stringify(res.data.data?.orders?.nodes, null, 2));
  } catch (err) {
    console.error('Recent orders error:', err.response?.data || err.message);
  }
}

fetchOrder();
