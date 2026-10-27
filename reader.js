const $ = id => document.getElementById(id);
const {normalizeUrl: normalize, mergeResults, output, filename} = globalThis.ZhihuReader;
let sourceId = Number(new URLSearchParams(location.search).get('tab')) || null;
let result = null;
let busy = false;
$('url').value = new URLSearchParams(location.search).get('url') || '';
$('version').textContent = `本地工具 · ${chrome.runtime.getManifest().version}`;
const pause = ms => new Promise(r => setTimeout(r, ms));
function message(s) { $('status').textContent = s; }
function controls() {
  $('read').disabled = busy;
  $('source').disabled = busy;
  $('url').disabled = busy;
  $('form').setAttribute('aria-busy', String(busy));
  for (const id of ['copy','export','more']) $(id).disabled = busy || !result?.answers.length;
}
async function source(url) {
  if (sourceId) {
    try { const tab = await chrome.tabs.get(sourceId); if (normalize(tab.url || '') === url) return tab; } catch {}
  }
  const tabs = await chrome.tabs.query({url: 'https://www.zhihu.com/*'});
  const existing = tabs.find(t => { try { return normalize(t.url || '') === url; } catch { return false; } });
  const tab = existing || await chrome.tabs.create({url, active:false});
  sourceId = tab.id;
  return tab;
}
async function waitLoaded(id) {
  for (let i = 0; i < 40; i++) { const tab = await chrome.tabs.get(id); if (tab.status === 'complete') return; await pause(500); }
  throw new Error('页面加载超过 20 秒。请打开原页面检查，再返回重试。');
}
function render() {
  $('result').hidden = !result;
  if (!result) return;
  $('title').textContent = result.title;
  $('summary').textContent = `${result.targetId ? '指定回答' : '问题页已加载回答'} · ${result.answers.length} 篇 · ${new Date(result.capturedAt).toLocaleString()}`;
  $('answers').replaceChildren();
  for (const [i,a] of result.answers.entries()) {
    const section = document.createElement('article'); section.className = 'answer';
    const heading = document.createElement('h3'); heading.textContent = `${i+1}. ${a.author}`;
    const link = document.createElement('a'); link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '查看原回答';
    const pre = document.createElement('pre'); pre.className = 'body'; pre.textContent = a.text;
    section.append(heading,link);
    if (a.warning) { const p = document.createElement('p'); p.className = 'warning'; p.textContent = a.warning; section.append(p); }
    section.append(pre); $('answers').append(section);
  }
}
async function read(mode = 'read') {
  if (busy) return;
  busy = true; controls();
  try {
    const url = normalize($('url').value);
    if (result && normalize(result.url) !== url) { result = null; render(); }
    message(mode === 'more' ? '正在原页面滚动 3 屏并读取，请稍候…' : '正在打开知乎页面并读取…');
    const tab = await source(url); await waitLoaded(tab.id);
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extract.js']});
    let [{result:next}] = await chrome.scripting.executeScript({target:{tabId:tab.id},func: m => globalThis.extractZhihu(m),args:[mode]});
    if (!next.answers.length && mode === 'read') { await pause(1500); [{result:next}] = await chrome.scripting.executeScript({target:{tabId:tab.id},func: () => globalThis.extractZhihu()}); }
    if (normalize(next.url) !== url) throw new Error('原页面跳转到了不同地址，请确认网址后重试。');
    if (next.error) { message(next.error + (result?.answers.length ? '\n之前读取的内容仍保留，下方不是本次读取结果。' : '')); return; }
    result = mergeResults(result, next); render();
    message(`已读取 ${result.answers.length} 篇回答。${result.targetId ? '已按回答编号匹配。' : '只包含本次和此前读取时已加载的回答，可继续加载。'}\n完整性未核实；图片链接保留在 Markdown 中。`);
  } catch(e) { message(`读取失败：${e.message}${result?.answers.length ? '\n之前读取的内容仍保留。' : ''}`); }
  finally { busy = false; controls(); }
}
$('form').addEventListener('submit',e => {e.preventDefault(); read();});
$('more').addEventListener('click',() => read('more'));
$('source').addEventListener('click',async () => { try {const tab = await source(normalize($('url').value)); await chrome.tabs.update(tab.id,{active:true});} catch(e){message(e.message);} });
$('copy').addEventListener('click',async () => { try {await navigator.clipboard.writeText(output(result, false)); message('正文已复制，可以粘贴到聊天或笔记中。');} catch {message('复制失败，请选中下方正文手动复制。');} });
$('export').addEventListener('click',() => {
  const url = URL.createObjectURL(new Blob([output(result, true)],{type:'text/markdown;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = filename(result.title); a.click(); setTimeout(() => URL.revokeObjectURL(url),10000);
});
if (sourceId) read();
