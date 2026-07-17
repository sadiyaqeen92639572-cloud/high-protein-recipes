// kie.ai z-image wrapper — see skill recipe-site-builder Phase 3 for prompt contract
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.KIE_AI_API_KEY;
if (!API_KEY) {
  console.error('Missing KIE_AI_API_KEY env var');
  process.exit(1);
}

function apiPost(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.kie.ai',
      path: pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => resolve(JSON.parse(chunks)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function apiGet(pathname) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: 'api.kie.ai', path: pathname, headers: { 'Authorization': `Bearer ${API_KEY}` } }, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => resolve(JSON.parse(chunks)));
    }).on('error', reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function generateOne(prompt, aspectRatio, outPath) {
  if (fs.existsSync(outPath)) {
    console.log(`⏭  skip (exists) ${outPath}`);
    return;
  }
  const create = await apiPost('/api/v1/jobs/createTask', {
    model: 'z-image',
    input: { prompt, aspect_ratio: aspectRatio, nsfw_checker: true }
  });
  if (create.code !== 200) throw new Error(`createTask failed: ${JSON.stringify(create)}`);
  const taskId = create.data.taskId;

  for (let i = 0; i < 15; i++) {
    await sleep(4000);
    const poll = await apiGet(`/api/v1/jobs/recordInfo?taskId=${taskId}`);
    const state = poll.data && poll.data.state;
    if (state === 'success') {
      const url = JSON.parse(poll.data.resultJson).resultUrls[0];
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      await download(url, outPath);
      console.log(`✅ ${outPath}`);
      return;
    }
    if (state === 'fail') throw new Error(`Generation failed: ${poll.data.failMsg}`);
  }
  throw new Error(`Timed out polling taskId ${taskId}`);
}

// usage: node generate-images.js <slug> "<hero prompt>" "<pin prompt>" "<texture prompt>"
async function main() {
  const [slug, heroPrompt, pinPrompt, texturePrompt] = process.argv.slice(2);
  if (!slug || !heroPrompt) {
    console.error('usage: node generate-images.js <slug> "<hero prompt>" "<pin prompt>" "<texture prompt>"');
    process.exit(1);
  }
  const dir = path.join(__dirname, 'images', slug);
  await generateOne(heroPrompt, '3:4', path.join(dir, 'hero.jpg'));
  if (pinPrompt) await generateOne(pinPrompt, '9:16', path.join(dir, 'pin.jpg'));
  if (texturePrompt) await generateOne(texturePrompt, '3:4', path.join(dir, 'texture.jpg'));
}

main().catch(e => { console.error(e); process.exit(1); });
