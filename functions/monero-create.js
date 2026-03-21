export async function onRequestPost(context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const RPC_URL = context.env.MONERO_RPC_URL;
  const RPC_USER = context.env.MONERO_RPC_USER || "";
  const RPC_PASS = context.env.MONERO_RPC_PASS || "";

  if (!RPC_URL) {
    return new Response(JSON.stringify({ error: "MONERO_RPC_URL no configurado" }), { status: 500, headers });
  }

  try {
    const body = await context.request.json();
    const { amount_usd, contract_type, order_id } = body;
    if (!amount_usd || !order_id) {
      return new Response(JSON.stringify({ error: "Faltan parámetros" }), { status: 400, headers });
    }

    const priceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd");
    const priceData = await priceRes.json();
    const xmrPrice = priceData?.monero?.usd;
    if (!xmrPrice) {
      return new Response(JSON.stringify({ error: "No se pudo obtener precio XMR" }), { status: 502, headers });
    }

    const amount_xmr = (amount_usd / xmrPrice).toFixed(12);
    const amount_atomic = Math.round(parseFloat(amount_xmr) * 1e12);

    const rpcHeaders = { "Content-Type": "application/json" };
    if (RPC_USER) rpcHeaders["Authorization"] = "Basic " + btoa(`${RPC_USER}:${RPC_PASS}`);

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
    if (rpcData.error) {
      return new Response(JSON.stringify({ error: rpcData.error.message }), { status: 502, headers });
    }

    const { address, address_index } = rpcData.result;
    return new Response(JSON.stringify({
      address, address_index, amount_xmr, amount_atomic,
      xmr_price_usd: xmrPrice, order_id,
      expires_at: Date.now() + 30 * 60 * 1000,
    }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" }
  });
}
