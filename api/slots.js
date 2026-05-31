import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const filePath = path.join(__dirname, '..', 'slots.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'slots.json not found. Run: node ../scripts/compute_slots.mjs' });
  }
}
