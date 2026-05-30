// Quick check: what does getProductStock actually return?
const BASE_URL = 'http://localhost:3847';

async function rpc(channel, payload = {}) {
  const res = await fetch(`${BASE_URL}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, payload }),
  });
  return res.json();
}

// Get first product ID first
const listRes = await rpc('products:list', {});
const firstProduct = listRes.result[0];
console.log('First product:', JSON.stringify({ id: firstProduct?.id, name: firstProduct?.name, code: firstProduct?.code }));

// Now check getProductStock
const stockRes = await rpc('products:getStock', firstProduct?.id);
console.log('\ngetProductStock raw response:', JSON.stringify(stockRes, null, 2));
