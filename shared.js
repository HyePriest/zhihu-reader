(function(root) {
  'use strict';

  function normalizeUrl(value) {
    let url;
    try { url = new URL(String(value).trim()); } catch { throw new Error('请输入有效的知乎问题或回答网址。'); }
    if (url.protocol !== 'https:' || url.hostname !== 'www.zhihu.com' || url.port || url.username || url.password || !/^\/question\/\d+(?:\/answer\/\d+)?\/?$/.test(url.pathname)) {
      throw new Error('请输入 https://www.zhihu.com/question/数字 或其 /answer/数字 链接。');
    }
    return url.origin + url.pathname.replace(/\/$/, '');
  }

  function mergeResults(previous, next) {
    if (!previous || normalizeUrl(previous.url) !== normalizeUrl(next.url)) return next;
    const answers = new Map();
    for (const answer of [...previous.answers, ...next.answers]) {
      const key = answer.id || answer.url + answer.author;
      const saved = answers.get(key);
      // Virtualized/collapsed cards must not overwrite an earlier complete capture.
      if (!saved || (saved.warning && !answer.warning) ||
          (Boolean(saved.warning) === Boolean(answer.warning) && answer.text.length >= saved.text.length)) answers.set(key, answer);
    }
    return {...next, answers: [...answers.values()]};
  }

  function escapeMarkdown(value) {
    return String(value).replace(/([\\`*_{}\[\]<>#+.!|~\-])/g, '\\$1');
  }

  function output(result, markdown) {
    const label = value => markdown ? escapeMarkdown(String(value).replace(/[\r\n]+/g, ' ')) : value;
    return `# ${label(result.title)}\n\n来源：${result.url}\n读取时间：${result.capturedAt}\n范围：${result.targetId ? '指定回答' : '已加载回答，非全部回答'}；完整性未核实\n\n` +
      result.answers.map((answer, i) => `## ${i + 1}. ${label(answer.author)}\n\n原回答：${answer.url}\n\n${answer.warning ? '提示：' + label(answer.warning) + '\n\n' : ''}${markdown ? answer.markdown : answer.text}`).join('\n\n---\n\n');
  }

  function filename(title) {
    const name = String(title || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 80).replace(/[. ]+$/g, '') || '知乎回答';
    return (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? '_' + name : name) + '.md';
  }

  root.ZhihuReader = {normalizeUrl, mergeResults, escapeMarkdown, output, filename};
  if (typeof module !== 'undefined') module.exports = root.ZhihuReader;
})(globalThis);
