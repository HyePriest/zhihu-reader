chrome.action.onClicked.addListener(tab => {
  const url = new URL(chrome.runtime.getURL('reader.html'));
  if (tab.id && /^https:\/\/www\.zhihu\.com\/question\/\d+/.test(tab.url || '')) {
    url.searchParams.set('tab', tab.id);
    url.searchParams.set('url', tab.url);
  }
  chrome.tabs.create({url: url.href});
});
