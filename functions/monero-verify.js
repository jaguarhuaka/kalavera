const REQUIRED_CONFIRMATIONS = 3;

export async function onRequestPost(context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const RPC_URL = context.env.MONERO_RPC_URL;
  const RPC_USER = context.env.MONERO_RPC_USER || "";
  const RPC_PASS = context.env.MONERO_RPC_PASS || "";

  const rpcHeaders = { "Content-Type": "application/json" };
  if (RPC_USER) rpcHeaders["Authorization"] = "Basic " + btoa(`${RPC_USER}:${RPC_PASS}`);

  const callRpc = async (method, params = {}) => {
    const res = await fetch(RPC_URL, {
      method: "POST", headers: rpcHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: "0", method, params }),
    });
    return res.json();
  };

  try {
    const body = await context.request.json();
    const { address_index, amount_atomic, tx_id } = body;

    if (tx_id) {
      const data = await callRpc("get_transfer_by_txid", { txid: tx_id });
      if (data.error || !data.result?.transfer) {
        return new Response(JSON.stringify({ status: "not_found" }), { status: 200, headers });
      }
      const tx = data.result.transfer;
      const confirmations = tx.confirmations || 0;
      return new Response(JSON.stringify({
        status: confirmations >= REQUIRED_CONFIRMATIONS ? "confirmed" : "pending",
        confirmations, required: REQUIRED_CONFIRMATIONS,
        amount_received: tx.amount, tx_id, mode: "manual",
      }), { status: 200, headers });
    }

    const data = await callRpc("get_transfers", {
      in: true, account_index: 0, subaddr_indices: [address_index],
    });

    if (data.error) return new Response(JSON.stringify({ error: data.error.message }), { status: 502, headers });

    const transfers = data.result?.in || [];
    const validTx = transfers.find(tx => tx.amount >= amount_atomic && tx.subaddr_index?.minor === address_index);

    if (!validTx) {
      return new Response(JSON.stringify({ status: "waiting", confirmations: 0, required: REQUIRED_CONFIRMATIONS }), { status: 200, headers });
    }

    const confirmations = validTx.confirmations || 0;
    return new Response(JSON.stringify({
      status: confirmations >= REQUIRED_CONFIRMATIONS ? "confirmed" : "pending",
      confirmations, required: REQUIRED_CONFIRMATIONS,
      amount_received: validTx.amount, tx_id: validTx.txid, mode: "auto",
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
