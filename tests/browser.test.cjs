const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require('playwright');
let browser;
before(async () => {
  const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  browser = await chromium.launch({headless: true, ...(channel ? {channel} : {})});
});
after(async () => { await browser?.close(); });

const root = path.resolve(__dirname, '..');
const card = (id, body, extra = '') => `<div class="AnswerItem" data-answer-id="${id}"><span class="AuthorInfo-name">作者 ${id}</span><div class="RichContent"><div class="RichContent-inner"><div class="RichText">${body}</div></div>${extra}</div></div>`;
async function fixture(t, html, url = 'https://www.zhihu.com/question/1') {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route('**/*', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto(url);
  await page.addScriptTag({path: path.join(root, 'extract.js')});
  return page;
}

test('extract loaded answers; export rich text without executable links or scripts', async t => {
  const page = await fixture(t, '<h1 class="QuestionHeader-title">测试问题</h1>' + card('2', '<p>第一段 *原样*</p><p><strong>加粗</strong>和<em>强调</em></p><a href="javascript:alert(1)">恶意链接</a><a href="/question/9">正常链接</a><img data-original="https://example.com/a.png" alt="图[一]"><script>window.secret="不应导出"</script><pre><code>const x = ````;</code></pre><ol start="3"><li>第三项</li><li>第四项</li></ol>') + card('3', '<p>另一篇</p>'));
  const value = await page.evaluate(() => extractZhihu());
  assert.equal(value.title, '测试问题');
  assert.equal(value.answers.length, 2);
  const a = value.answers[0];
  assert.ok(a.text.includes('第一段 *原样*'));
  assert.ok(a.markdown.includes('第一段 \\*原样\\*'));
  assert.ok(a.markdown.includes('**加粗**和*强调*'));
  assert.ok(a.markdown.includes('https://example.com/a.png'));
  assert.ok(a.markdown.includes('`````\nconst x = ````;\n`````'));
  assert.ok(a.markdown.includes('3. 第三项\n4. 第四项'));
  assert.ok(!a.markdown.includes('javascript:'));
  assert.ok(!a.text.includes('不应导出'));
});

test('answer URL matches the requested ID and never substitutes recommendations', async t => {
  const page = await fixture(t, card('2', '<p>目标回答</p>') + card('3', '<p>推荐回答</p>'), 'https://www.zhihu.com/question/1/answer/2');
  const value = await page.evaluate(() => extractZhihu());
  assert.equal(value.answers.length, 1);
  assert.equal(value.answers[0].id, '2');
  await page.locator('[data-answer-id="2"]').evaluate(e => e.remove());
  const missing = await page.evaluate(() => extractZhihu());
  assert.equal(missing.answers.length, 0);
  assert.match(missing.error, /指定的回答/);
});

test('waits for delayed expansion and warns when expansion never completes', async t => {
  const page = await fixture(t, card('2', '<p>摘要</p>', '<button>阅读全文</button>'));
  await page.locator('button').evaluate(button => button.onclick = () => setTimeout(() => {
    document.querySelector('.RichText').innerHTML = '<p>延迟加载的完整正文</p>';
    button.remove();
  }, 700));
  const value = await page.evaluate(() => extractZhihu());
  assert.equal(value.answers[0].text, '延迟加载的完整正文');
  assert.equal(value.answers[0].warning, '');
  await page.locator('.RichContent').evaluate(e => e.insertAdjacentHTML('beforeend', '<button>阅读全文</button>'));
  assert.match((await page.evaluate(() => extractZhihu())).answers[0].warning, /折叠/);
});

test('canonical answer sources cannot be replaced by external links', async t => {
  const page = await fixture(t, card('2', '<p>正文</p><a href="https://evil.example/question/1/answer/999">链接</a>'));
  assert.equal((await page.evaluate(() => extractZhihu())).answers[0].url, 'https://www.zhihu.com/question/1/answer/2');
});

test('verification and login pages return useful errors without fabricated answers', async t => {
  const page = await fixture(t, '<p>安全验证，请输入验证码</p>');
  assert.match((await page.evaluate(() => extractZhihu())).error, /访问限制或验证/);
  await page.setContent('<p>请登录或注册</p>');
  assert.match((await page.evaluate(() => extractZhihu())).error, /登录/);
});

test('load more captures newly inserted answers across three scrolls and deduplicates', async t => {
  const page = await fixture(t, card('2', '<p>初始回答</p>'));
  await page.evaluate(html => {
    let count = 0;
    window.scrollBy = () => { if (!count++) document.body.insertAdjacentHTML('beforeend', html); };
  }, card('3', '<p>新增回答</p>'));
  const value = await page.evaluate(() => extractZhihu('more'));
  assert.deepEqual(value.answers.map(a => a.id), ['2', '3']);
});

test('reader renders text safely, copies and exports; failed reads preserve the previous result', async t => {
  const context = await browser.newContext({acceptDownloads: true});
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route('**/*', async route => {
    const file = path.basename(new URL(route.request().url()).pathname) || 'reader.html';
    if (!['reader.html', 'reader.css', 'shared.js', 'reader.js'].includes(file)) return route.abort();
    await route.fulfill({contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8', body: await fs.readFile(path.join(root, file))});
  });
  await page.addInitScript(() => {
    window.__next = {title: '<script>不执行</script>', url: 'https://www.zhihu.com/question/1', targetId: null, capturedAt: new Date().toISOString(), error: '', answers: [{id: '2', url: 'https://www.zhihu.com/question/1/answer/2', author: '测试作者', text: '<img src=x onerror=alert(1)>正文', markdown: '导出正文', warning: ''}]};
    Object.defineProperty(navigator, 'clipboard', {value: {writeText: async value => { window.__copied = value; }}});
    window.chrome = {
      runtime: {getManifest: () => ({version: '0.1.1'})},
      tabs: {query: async () => [], create: async () => ({id: 1}), get: async () => ({id: 1, url: 'https://www.zhihu.com/question/1', status: 'complete'})},
      scripting: {executeScript: async config => config.files ? [] : [{result: structuredClone(window.__next)}]}
    };
  });
  await page.goto('https://reader.test/reader.html');
  assert.equal(await page.locator('#url').inputValue(), '');
  await page.locator('#url').fill('https://www.zhihu.com/question/1?from=share');
  await page.locator('#read').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('已读取'));
  assert.equal(await page.locator('.body img').count(), 0);
  assert.equal(await page.locator('.body').textContent(), '<img src=x onerror=alert(1)>正文');
  await page.locator('#copy').click();
  await page.waitForFunction(() => window.__copied);
  assert.ok((await page.evaluate(() => window.__copied)).includes('原回答：'));
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadEvent;
  assert.ok(download.suggestedFilename().endsWith('.md'));
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'zhihu-reader-test-'));
  t.after(() => fs.rm(temp, {recursive: true, force: true}));
  const saved = path.join(temp, 'answer.md');
  await download.saveAs(saved);
  assert.ok((await fs.readFile(saved, 'utf8')).includes('导出正文'));
  await page.evaluate(() => { window.__next.answers = []; window.__next.error = '页面需要验证'; });
  await page.locator('#read').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('之前读取的内容仍保留'));
  assert.equal(await page.locator('.answer').count(), 1);
  assert.equal(await page.locator('#read').isEnabled(), true);
});
