const REQUIRED_CONFIRMATIONS = 3;

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

  const rpcHeaders = { "Content-Type": "application/json" };
  if (RPC_USER) rpcHeaders["Authorization"] = "Basic " + Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString("base64");

  const callRpc = async (method, params = {}) => {
    const res = await fetch(RPC_URL, {
      method: "POST", headers: rpcHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: "0", method, params }),
    });
    return res.json();
  };

  try {
    const body = JSON.parse(event.body || "{}");
    const { address_index, amount_atomic, tx_id } = body;

    if (tx_id) {
      const data = await callRpc("get_transfer_by_txid", { txid: tx_id });
      if (data.error || !data.result?.transfer) {
        return { statusCode: 200, headers, body: JSON.stringify({ status: "not_found", message: "TX no encontrada" }) };
      }
      const tx = data.result.transfer;
      const confirmations = tx.confirmations || 0;
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          status: confirmations >= REQUIRED_CONFIRMATIONS ? "confirmed" : "pending",
          confirmations, required: REQUIRED_CONFIRMATIONS,
          amount_received: tx.amount, tx_id, mode: "manual",
        }),
      };
    }

    if (address_index === undefined || !amount_atomic) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Se requiere address_index + amount_atomic, o tx_id" }) };
    }

    const data = await callRpc("get_transfers", {
      in: true, account_index: 0, subaddr_indices: [address_index],
    });

    if (data.error) return { statusCode: 502, headers, body: JSON.stringify({ error: data.error.message }) };

    const transfers = data.result?.in || [];
    const validTx = transfers.find(tx => tx.amount >= amount_atomic && tx.subaddr_index?.minor === address_index);

    if (!validTx) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ status: "waiting", confirmations: 0, required: REQUIRED_CONFIRMATIONS, mode: "auto" }),
      };
    }

    const confirmations = validTx.confirmations || 0;
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        status: confirmations >= REQUIRED_CONFIRMATIONS ? "confirmed" : "pending",
        confirmations, required: REQUIRED_CONFIRMATIONS,
        amount_received: validTx.amount, tx_id: validTx.txid, mode: "auto",
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
