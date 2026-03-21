exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const RPC_URL = process.env.MONERO_RPC_URL;
  const RPC_USER = process.env.MONERO_RPC_USER || "";
  const RPC_PASS = process.env.MONERO_RPC_PASS || "";

  if (!RPC_URL) return { statusCode: 500, headers, body: JSON.stringify({ error: "MONERO_RPC_URL no configurado" }) };

  try {
    const body = JSON.parse(event.body || "{}");
    const { amount_usd, contract_type, order_id } = body;
    if (!amount_usd || !order_id) return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan parámetros" }) };

    const priceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd");
    const priceData = await priceRes.json();
    const xmrPrice = priceData?.monero?.usd;
    if (!xmrPrice) return { statusCode: 502, headers, body: JSON.stringify({ error: "No se pudo obtener precio XMR" }) };

    const amount_xmr = (amount_usd / xmrPrice).toFixed(12);
    const amount_atomic = Math.round(parseFloat(amount_xmr) * 1e12);

    const rpcHeaders = { "Content-Type": "application/json" };
    if (RPC_USER) rpcHeaders["Authorization"] = "Basic " + Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString("base64");

    const rpcRes = await fetch(RPC_URL, {
      method: "POST",
      headers: rpcHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0", id: "0",
        method: "create_address",
        params: { account_index: 0, label: `order_${order_id}_${contract_type || "contract"}` },
      }),
    });

    const rpcData = await rpcRes.json();
    if (rpcData.error) return { statusCode: 502, headers, body: JSON.stringify({ error: rpcData.error.message }) };

    const { address, address_index } = rpcData.result;
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ address, address_index, amount_xmr, amount_atomic, xmr_price_usd: xmrPrice, order_id, expires_at: Date.now() + 30 * 60 * 1000 }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
