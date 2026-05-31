export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gasUrl = process.env.GAS_WEB_APP_URL;
  if (!gasUrl) {
    return res.status(503).json({
      ok: false,
      error: 'GAS_WEB_APP_URL が未設定です。Vercel の環境変数に Web App URL を追加してください。',
    });
  }

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      redirect: 'follow',
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        ok: false,
        error: 'GAS からの応答を解析できませんでした',
        raw: text.slice(0, 200),
      });
    }

    if (!data.ok) {
      return res.status(400).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: '予約の送信に失敗しました: ' + err.message,
    });
  }
}
