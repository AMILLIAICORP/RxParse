require('dotenv').config();
const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(__dirname));

const PARSE_PROMPT = `You are a prescription data extraction specialist. Extract all information from this prescription and return ONLY valid JSON with no markdown, no explanation.

Use this exact structure:
{
  "patient": {
    "name": "string or null",
    "dob": "string or null",
    "address": "string or null",
    "phone": "string or null"
  },
  "medication": {
    "name": "string or null",
    "strength": "string or null",
    "dosage_form": "string or null",
    "quantity": "string or null",
    "days_supply": "string or null",
    "directions": "string or null",
    "refills": "string or null"
  },
  "prescriber": {
    "name": "string or null",
    "npi": "string or null",
    "dea": "string or null",
    "phone": "string or null",
    "address": "string or null"
  },
  "prescription": {
    "date_written": "string or null",
    "date_expires": "string or null",
    "rx_number": "string or null",
    "brand_required": "boolean",
    "controlled_substance": "boolean"
  },
  "flags": ["any issues, missing fields, unclear handwriting, potential drug interactions, or items needing pharmacist review"],
  "status": "clean or review or urgent",
  "confidence": "high or medium or low"
}

Prescription content:`;

app.post('/parse/text', async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Prescription text too short' });
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: PARSE_PROMPT + '\n\n' + text }]
    });
    const responseText = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[parse/text]', err);
    res.status(500).json({ error: 'Failed to parse prescription' });
  }
});

app.post('/parse/image', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const fileData = fs.readFileSync(req.file.path);
    const base64 = fileData.toString('base64');
    const mediaType = req.file.mimetype;
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PARSE_PROMPT }
        ]
      }]
    });
    fs.unlinkSync(req.file.path);
    const responseText = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[parse/image]', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to parse prescription image' });
  }
});

app.get('/terms', (req, res) => res.sendFile(__dirname + '/terms.html'));
app.get('/privacy', (req, res) => res.sendFile(__dirname + '/privacy.html'));
app.get('/baa', (req, res) => res.sendFile(__dirname + '/baa.html'));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'rxparse' }));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RxParse running on :${PORT}`));
