// kie.ai flux-2/pro-text-to-image wrapper — fallback when z-image can't render a subject
// (z-image renders "riced cauliflower" as long-grain white rice + whole florets, confirmed 3x).
// usage: node generate-images-flux.js <slug> "<hero prompt>" "<pin prompt>" "<texture prompt>"
// Overwrites existing images, moving each old file to <name>.jpg.zbak first.
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.KIE_AI_API_KEY;
if (!API_KEY) { console.error('Missing KIE_AI_API_KEY env var'); process.exit(1); }

function apiPost(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.kie.ai', path: pathname, method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let chunks = ''; res.on('data', c => chunks += c);
      res.on('end', () => resolve(JSON.parse(chunks)));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

function apiGet(pathname) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: 'api.kie.ai', path: pathname, headers: { 'Authorization': `Bearer ${API_KEY}` } }, res => {
      let chunks = ''; res.on('data', c => chunks += c);
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function generateOne(prompt, aspectRatio, outPath) {
  const create = await apiPost('/api/v1/jobs/createTask', {
    model: 'flux-2/pro-text-to-image',
    input: { prompt, aspect_ratio: aspectRatio, resolution: '2K', nsfw_checker: true }
  });
  if (create.code !== 200) throw new Error(`createTask failed: ${JSON.stringify(create)}`);
  const taskId = create.data.taskId;
  console.log(`… task ${taskId} (${aspectRatio}) ${path.basename(outPath)}`);

  for (let i = 0; i < 40; i++) {
    await sleep(5000);
    const poll = await apiGet(`/api/v1/jobs/recordInfo?taskId=${taskId}`);
    const state = poll.data && poll.data.state;
    if (state === 'success') {
      const url = JSON.parse(poll.data.resultJson).resultUrls[0];
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      if (fs.existsSync(outPath)) fs.renameSync(outPath, outPath + '.zbak');
      await download(url, outPath);
      console.log(`✅ ${outPath}`);
      return;
    }
    if (state === 'fail') throw new Error(`Generation failed: ${poll.data.failCode} ${poll.data.failMsg}`);
  }
  throw new Error(`Timed out polling taskId ${taskId}`);
}

async function main() {
  const [slug, heroPrompt, pinPrompt, texturePrompt] = process.argv.slice(2);
  if (!slug || !heroPrompt) {
    console.error('usage: node generate-images-flux.js <slug> "<hero>" "<pin>" "<texture>"');
    process.exit(1);
  }
  const dir = path.join(__dirname, 'images', slug);
  await generateOne(heroPrompt, '3:4', path.join(dir, 'hero.jpg'));
  if (pinPrompt) await generateOne(pinPrompt, '9:16', path.join(dir, 'pin.jpg'));
  if (texturePrompt) await generateOne(texturePrompt, '3:4', path.join(dir, 'texture.jpg'));
}

main().catch(e => { console.error(e); process.exit(1); });
