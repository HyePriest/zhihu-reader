const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizeUrl, mergeResults, output, filename} = require('../shared.js');

test('URL normalization accepts only canonical Zhihu question/answer paths', () => {
  assert.equal(normalizeUrl(' https://www.zhihu.com/question/123/answer/456/?utm_source=test#x '), 'https://www.zhihu.com/question/123/answer/456');
  assert.equal(normalizeUrl('https://www.zhihu.com/question/123/'), 'https://www.zhihu.com/question/123');
  for (const value of ['invalid', 'http://www.zhihu.com/question/1', 'https://evil.example/question/1', 'https://www.zhihu.com.evil.example/question/1', 'https://www.zhihu.com:8080/question/1', 'https://user:secret@www.zhihu.com/question/1', 'https://zhuanlan.zhihu.com/p/1', 'https://www.zhihu.com/question/1/answer/2/extra', 'javascript:alert(1)', 'https://www.zhihu.com/']) {
    assert.throws(() => normalizeUrl(value), undefined, value);
  }
});

const answer = (id, text, warning = '') => ({id, url: `https://www.zhihu.com/question/1/answer/${id}`, author: '作者', text, markdown: text, warning});
const result = answers => ({url: 'https://www.zhihu.com/question/1', title: '标题', capturedAt: '2026-10-28T00:00:00.000Z', answers});

test('merge deduplicates IDs and keeps full text when a card later collapses', () => {
  const before = result([answer('2', '完整正文')]);
  const after = result([answer('2', '摘要', '仍折叠'), answer('3', '另一个回答')]);
  const merged = mergeResults(before, after);
  assert.equal(merged.answers.length, 2);
  assert.equal(merged.answers[0].text, '完整正文');
  assert.equal(before.answers.length, 1, 'merge must not mutate saved results');
});

test('merge prefers a successful expansion even if its text is shorter', () => {
  assert.equal(mergeResults(result([answer('2', '摘要和大量折叠提示', '仍折叠')]), result([answer('2', '正文')])).answers[0].text, '正文');
});

test('results from different questions never mix', () => {
  const next = {...result([answer('3', '新问题')]), url: 'https://www.zhihu.com/question/999'};
  assert.equal(mergeResults(result([answer('2', '旧问题')]), next), next);
});

test('export escapes heading metadata and includes provenance and scope', () => {
  const value = {...result([answer('2', '正文')]), title: '[标题](https://evil.example)\n#注入'};
  const md = output(value, true);
  assert.ok(md.startsWith('# \\[标题\\](https://evil\\.example) \\#注入'));
  assert.ok(md.includes('已加载回答，非全部回答'));
  assert.ok(md.includes('原回答：https://www.zhihu.com/question/1/answer/2'));
  assert.ok(output(value, false).includes('[标题](https://evil.example)'));
});

test('download names handle Windows reserved words, unsafe characters and empty titles', () => {
  assert.equal(filename('CON'), '_CON.md');
  assert.equal(filename('NUL.txt'), '_NUL.txt.md');
  assert.equal(filename('a/b:c?'), 'a_b_c_.md');
  assert.equal(filename('... '), '知乎回答.md');
  assert.equal(filename('标题. '), '标题.md');
});
