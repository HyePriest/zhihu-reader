// Runs in the isolated extension world; no login state or page scripts are read.
globalThis.extractZhihu = async function(mode = 'read') {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clean = s => (s || '').replace(/\u200b/g, '').trim();
  const escapeMarkdown = s => s.replace(/([\\`*_{}\[\]<>#+.!|~\-])/g, '\\$1');
  const expanded = new WeakSet();
  const expandButton = card => [...card.querySelectorAll('button')].find(b => /^(展开阅读全文|阅读全文|显示全部)$/.test(clean(b.textContent)));
  const isCollapsed = card => !!expandButton(card) || !!card.querySelector('.RichContent.is-collapsed');
  function safeUrl(value) {
    if (!value) return '';
    try { const u = new URL(value, location.href); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href.replace(/[<>\\\s]/g, c => encodeURIComponent(c)) : ''; } catch { return ''; }
  }
  function markdown(root) {
    function visit(n) {
      if (n.nodeType === 3) return escapeMarkdown(n.textContent);
      if (n.nodeType !== 1) return '';
      const tag = n.tagName.toLowerCase();
      if (['script','style','button','noscript','svg'].includes(tag)) return '';
      const children = () => [...n.childNodes].map(visit).join('');
      if (tag === 'img') {
        const u = safeUrl(n.getAttribute('data-original') || n.getAttribute('data-actualsrc') || n.getAttribute('data-src') || n.getAttribute('src'));
        return u ? `\n![${escapeMarkdown((n.alt || '图片').replace(/[\r\n]+/g, ' '))}](<${u}>)\n` : '';
      }
      if (tag === 'br') return '\n';
      if (tag === 'pre' || tag === 'code') {
        const value = n.textContent;
        const longest = Math.max(0, ...(value.match(/`+/g) || []).map(run => run.length));
        const fence = '`'.repeat(Math.max(tag === 'pre' ? 3 : 1, longest + 1));
        return tag === 'pre' ? `\n\n${fence}\n${value.replace(/^\n|\n$/g, '')}\n${fence}\n\n` : `${fence} ${value.replace(/\n/g, ' ')} ${fence}`;
      }
      if (tag === 'strong' || tag === 'b') return '**' + children() + '**';
      if (tag === 'em' || tag === 'i') return '*' + children() + '*';
      if (tag === 'a') { const u = safeUrl(n.getAttribute('href')); return u ? `[${children()}](<${u.replace(/>/g, '%3E')}>)` : children(); }
      if (/^h[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + children() + '\n\n';
      if (tag === 'li') {
        const parent = n.parentElement;
        const prefix = parent?.tagName === 'OL' ? (Number(parent.getAttribute('start') || 1) + [...parent.children].filter(c => c.tagName === 'LI').indexOf(n)) + '.' : '-';
        return '\n' + prefix + ' ' + children().trim().replace(/\n/g, '\n  ');
      }
      if (tag === 'blockquote') return '\n\n' + children().trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n';
      if (tag === 'tr') return '\n' + [...n.children].map(c => visit(c).trim()).join(' | ');
      if (['p','div','figure','figcaption','ul','ol','table'].includes(tag)) return '\n\n' + children() + '\n\n';
      return children();
    }
    return clean(visit(root).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'));
  }
  function plain(root) {
    function visit(n) {
      if (n.nodeType === 3) return n.textContent;
      if (n.nodeType !== 1) return '';
      const tag = n.tagName.toLowerCase();
      if (['script','style','button','noscript','svg'].includes(tag)) return '';
      if (tag === 'br') return '\n';
      if (tag === 'img') return n.alt ? ` [图片：${n.alt}] ` : ' [图片，见 Markdown 导出] ';
      const value = [...n.childNodes].map(visit).join('');
      if (['p','div','figure','figcaption','blockquote','pre','ul','ol','table'].includes(tag) || /^h[1-6]$/.test(tag)) return '\n\n'+value+'\n\n';
      if (tag === 'li' || tag === 'tr') return '\n'+value;
      if (tag === 'td' || tag === 'th') return value+'\t';
      return value;
    }
    return clean(visit(root).replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n'));
  }
  const targetId = location.pathname.match(/\/answer\/(\d+)/)?.[1];
  const answers = new Map();
  function identity(card) {
    let data = {};
    try { data = JSON.parse(card.getAttribute('data-zop') || '{}'); } catch {}
    const questionId = location.pathname.match(/question\/(\d+)/)?.[1];
    const link = [...card.querySelectorAll('a[href],meta[itemprop="url"]')].map(e => {
      try {
        const url = new URL(e.getAttribute('href') || e.getAttribute('content'), location.href);
        return url.origin === location.origin && new RegExp(`^/question/${questionId}/answer/\\d+/?$`).test(url.pathname) ? url : null;
      } catch { return null; }
    }).find(Boolean);
    const id = [data.itemId, card.getAttribute('data-answer-id'), link?.pathname.match(/\/answer\/(\d+)/)?.[1]].map(v => String(v || '')).find(v => /^\d+$/.test(v)) || '';
    return {id, url: id ? `${location.origin}/question/${questionId}/answer/${id}` : location.href};
  }
  async function capture() {
    let cards = [...document.querySelectorAll('.AnswerItem')];
    for (const card of cards) {
      const info = identity(card);
      // Never substitute a recommended answer for the answer named in the URL.
      if (targetId && info.id !== targetId) continue;
      const expand = expandButton(card);
      if (expand && !expanded.has(card)) {
        expanded.add(card);
        expand.click();
        // Expansion may fetch the body asynchronously; stop as soon as it settles.
        const deadline = Date.now() + 1800;
        do { await pause(100); } while (Date.now() < deadline && isCollapsed(card));
      }
      const body = card.querySelector('.RichContent-inner .RichText, .RichContent-inner, .RichText');
      if (!body) continue;
      const clone = body.cloneNode(true);
      clone.querySelectorAll('script,style,button,noscript').forEach(e => e.remove());
      const text = plain(clone);
      if (!text) continue;
      const truncated = isCollapsed(card);
      const warning = truncated ? '仍有折叠标记，可能只读取到摘要。请在原页面展开后重试。' : /付费|盐选|会员.*阅读/.test(text) ? '可能含付费或会员内容，仅提取网页实际提供的部分。' : '';
      const answer = {id: info.id, url: info.url, author: clean(card.querySelector('.AuthorInfo-name')?.textContent) || '作者未识别', text, markdown: markdown(clone), warning};
      const key = info.id || info.url + answer.author;
      const previous = answers.get(key);
      if (!previous || (previous.warning && !answer.warning) ||
          (Boolean(previous.warning) === Boolean(answer.warning) && answer.text.length >= previous.text.length)) answers.set(key, answer);
    }
  }
  await capture();
  if (mode === 'more') {
    for (let i = 0; i < 3; i++) {
      window.scrollBy(0, Math.max(window.innerHeight * .85, 500));
      await pause(1000);
      await capture();
    }
  }
  const title = clean(document.querySelector('.QuestionHeader-title')?.textContent) || document.title.replace(/\s*[-–]\s*知乎.*$/, '');
  const visibleText = document.body.innerText || '';
  let error = '';
  if (!answers.size) {
    error = /安全验证|访问异常|请求过于频繁|验证码|403|Forbidden/i.test(visibleText) ? '知乎页面被访问限制或验证拦住。请打开原页面处理后重试。' : /登录|注册/.test(visibleText) ? '没有找到可读取的回答。请在原页面确认是否需要登录，并等待回答加载后重试。' : targetId ? '没有找到网址指定的回答。它可能尚未加载、已删除，或页面结构已经变化。' : '没有找到已加载的回答。请在原页面等待内容出现后重试。';
  }
  return {title, url: location.href, targetId: targetId || null, answers: [...answers.values()], capturedAt: new Date().toISOString(), error};
};
