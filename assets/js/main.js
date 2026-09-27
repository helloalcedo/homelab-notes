(() => {
  'use strict';
  const root = document.documentElement;
  const themeButton = document.querySelector('[data-theme-toggle]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const applyTheme = theme => {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'ink' ? '#141413' : '#eeeadf';
    themeButton.setAttribute('aria-label', theme === 'ink' ? '종이 테마로 변경' : '먹 테마로 변경');
    try { localStorage.setItem('alcedo-theme', theme); } catch { /* Storage may be disabled. */ }
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  };
  if (themeButton) {
    themeButton.hidden = false;
    applyTheme(root.dataset.theme || 'ink');
    let changing = false;
    themeButton.addEventListener('click', async event => {
      if (changing) return;
      changing = true;
      const theme = root.dataset.theme === 'ink' ? 'paper' : 'ink';
      try {
        if (document.startViewTransition && !reducedMotion.matches) {
          const rect = themeButton.getBoundingClientRect();
          const x = event.clientX || rect.left + rect.width / 2;
          const y = event.clientY || rect.top + rect.height / 2;
          const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
          root.classList.add('theme-transition');
          const transition = document.startViewTransition(() => applyTheme(theme));
          await transition.ready;
          await root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, {
            duration: 560, easing: 'cubic-bezier(.22,.61,.36,1)', pseudoElement: '::view-transition-new(root)'
          }).finished;
          await transition.finished;
        } else applyTheme(theme);
      } catch { applyTheme(theme); }
      finally {
        root.classList.remove('theme-transition');
        changing = false;
      }
    });
  }

  // A cross-document transition the browser skips (for example when a navigation starts
  // mid-transition) rejects its promises; settle them so a skipped animation stays silent.
  const quiet = event => {
    const transition = event.viewTransition;
    if (!transition) return;
    for (const promise of [transition.ready, transition.finished, transition.updateCallbackDone]) promise?.catch(() => {});
  };
  addEventListener('pageswap', quiet);
  addEventListener('pagereveal', quiet);

  // Slim header: steps aside while reading down, returns on the way up.
  const siteHeader = document.querySelector('[data-site-header]');
  if (siteHeader) {
    let lastY = scrollY;
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const y = scrollY;
      siteHeader.classList.toggle('is-scrolled', y > 8);
      const hide = y > 160 && y > lastY + 4 && !siteHeader.contains(document.activeElement) && !document.querySelector('dialog[open]');
      if (hide) siteHeader.classList.add('is-hidden');
      else if (y < lastY - 4 || y <= 160) siteHeader.classList.remove('is-hidden');
      lastY = y;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    siteHeader.addEventListener('focusin', () => siteHeader.classList.remove('is-hidden'));
    onScroll();
  }

  const dialog = document.querySelector('#search-dialog');
  const input = dialog?.querySelector('[data-search-input]');
  let indexPromise;
  const loadIndex = () => {
    if (!indexPromise) {
      indexPromise = fetch(document.body.dataset.searchIndex)
        .then(response => {
          if (!response.ok) throw new Error('Search index unavailable');
          return response.json();
        })
        .catch(error => { indexPromise = undefined; throw error; });
    }
    return indexPromise;
  };
  const normalise = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
  /** Append text to a node, wrapping every occurrence of the query words in <mark>. */
  const highlight = (element, text, words) => {
    const source = String(text || '');
    const lower = normalise(source);
    const ranges = [];
    for (const word of words) {
      if (!word) continue;
      let from = 0;
      for (let at = lower.indexOf(word, from); at >= 0; at = lower.indexOf(word, from)) {
        ranges.push([at, at + word.length]);
        from = at + word.length;
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start < cursor) continue;
      if (start > cursor) element.append(source.slice(cursor, start));
      const mark = document.createElement('mark');
      mark.textContent = source.slice(start, end);
      element.append(mark);
      cursor = end;
    }
    if (cursor < source.length) element.append(source.slice(cursor));
  };
  const bindSearch = container => {
    const field = container.querySelector('[data-search-input]');
    field.disabled = false;
    const status = container.querySelector('[data-search-status]');
    const list = container.querySelector('[data-search-results]');
    let revision = 0;
    const render = async () => {
      const current = ++revision;
      const query = field.value.trim();
      list.replaceChildren();
      if (!query) {
        status.textContent = '검색어를 입력하면 프로젝트와 노트를 함께 찾습니다.';
        return;
      }
      status.textContent = '기록을 찾고 있습니다…';
      try {
        const records = await loadIndex();
        if (current !== revision) return;
        const words = normalise(query).split(/\s+/).filter(Boolean);
        const matches = records.filter(record => {
          const haystack = normalise([record.title, record.summary, record.content, ...(record.tags || [])].join(' '));
          return words.every(word => haystack.includes(word));
        }).sort((a,b) => Number(normalise(b.title).includes(normalise(query))) - Number(normalise(a.title).includes(normalise(query))));
        status.textContent = matches.length ? `“${query}”에 관한 기록 ${matches.length}개` : `“${query}”에 관한 기록이 없습니다. 다른 검색어를 입력해 보세요.`;
        for (const record of matches.slice(0,30)) {
          const url = new URL(record.url, location.href);
          if (url.origin !== location.origin) continue;
          const li = document.createElement('li');
          const link = document.createElement('a');
          link.href = url.href;
          const section = document.createElement('span'); section.textContent = record.section;
          const title = document.createElement('strong'); highlight(title, record.title, words);
          const description = document.createElement('p'); highlight(description, record.summary, words);
          link.append(section,title,description); li.append(link); list.append(li);
        }
      } catch {
        if (current === revision) status.textContent = '검색 자료를 불러오지 못했습니다. 다시 입력하거나 Projects·Notes 목록을 이용해 주세요.';
      }
    };
    field.addEventListener('input',render);
    field.addEventListener('keydown',event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); list.querySelector('a')?.focus(); }
      if (event.key === 'Enter') { event.preventDefault(); list.querySelector('a')?.click(); }
    });
    // Arrow keys walk the results; Escape or ArrowUp from the first returns to the field.
    list.addEventListener('keydown', event => {
      const links = [...list.querySelectorAll('a')];
      const index = links.indexOf(document.activeElement);
      if (index < 0) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); links[Math.min(links.length - 1, index + 1)].focus(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); (index === 0 ? field : links[index - 1]).focus(); }
    });
    return render;
  };
  if (dialog && typeof dialog.showModal === 'function') {
    bindSearch(dialog);
    const openSearch = () => { if (!dialog.open) dialog.showModal(); input.focus(); };
    document.querySelectorAll('[data-search-open]').forEach(link => link.addEventListener('click',event => { event.preventDefault(); openSearch(); }));
    dialog.querySelector('[data-search-close]').addEventListener('click',() => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
    });
    dialog.addEventListener('click',event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    document.addEventListener('keydown',event => {
      const editing = event.target.isContentEditable || event.target.closest('input, textarea, select');
      if (((event.code === 'KeyK' || event.key.toLowerCase() === 'k') && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey)) {
        event.preventDefault(); openSearch();
      }
    });
  }
  const searchPage = document.querySelector('[data-search-page]');
  if (searchPage) {
    const render = bindSearch(searchPage);
    const query = new URLSearchParams(location.search).get('q');
    if (query) { searchPage.querySelector('[data-search-input]').value = query; render(); }
  }

  /** Reading progress and the current table-of-contents entry for one article view. */
  function trackReading(container) {
    const article = container.matches?.('article') ? container : container.querySelector('article.article');
    if (!article) return;
    const scroller = article.closest('.article-reader');
    const target = scroller || window;
    const bar = article.querySelector('[data-reading-progress] span');
    const links = [...article.querySelectorAll('.toc nav a[href^="#"]')];
    const headings = links.map(link => {
      try { return article.querySelector('#' + CSS.escape(decodeURIComponent(link.hash.slice(1)))); } catch { return null; }
    });
    let ticking = false;
    const update = () => {
      ticking = false;
      if (!article.isConnected) return;
      const box = article.getBoundingClientRect();
      const viewport = scroller ? scroller.clientHeight : innerHeight;
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      const total = Math.max(1, box.height - viewport * 0.6);
      const progress = Math.min(1, Math.max(0, (top - box.top) / total));
      bar?.style.setProperty('--progress', progress.toFixed(4));
      let active = -1;
      headings.forEach((heading, index) => { if (heading && heading.getBoundingClientRect().top - top < viewport * 0.3) active = index; });
      links.forEach((link, index) => link.classList.toggle('is-active', index === active));
    };
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    target.addEventListener('scroll', request, { passive: true });
    addEventListener('resize', request, { passive: true });
    update();
  }

  function enhanceArticle(container) {
    container.querySelectorAll('.prose table').forEach(table => {
      if (table.closest('.table-scroll')) return;
      const wrapper = document.createElement('div'); wrapper.className = 'table-scroll';
      wrapper.tabIndex = 0; wrapper.setAttribute('role','region'); wrapper.setAttribute('aria-label','표, 가로로 스크롤할 수 있습니다');
      table.before(wrapper); wrapper.append(table);
    });
    container.querySelectorAll('.prose .highlight').forEach(block => {
      if (block.querySelector('.code-lang')) return;
      const language = block.querySelector('code[data-lang]')?.dataset.lang;
      if (!language) return;
      const label = document.createElement('span');
      label.className = 'code-lang';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = language;
      block.prepend(label);
    });
    trackReading(container);
    if (!navigator.clipboard?.writeText) return;
    container.querySelectorAll('.prose .highlight').forEach(block => {
      if (block.querySelector('.code-copy')) return;
      const code = block.querySelector('pre code'); if (!code) return;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'code-copy'; button.textContent = '복사'; button.setAttribute('aria-label','코드 복사');
      const status = block.querySelector('.code-copy-status') || document.createElement('span');
      status.className = 'code-copy-status visually-hidden';
      status.setAttribute('role', 'status');
      status.textContent = '';
      if (!status.parentElement) block.append(status);
      let reset;
      button.addEventListener('click',async () => {
        clearTimeout(reset);
        status.textContent = '';
        try { await navigator.clipboard.writeText(code.textContent); button.textContent = '복사됨'; status.textContent = '코드를 복사했습니다.'; }
        catch { button.textContent = '직접 선택해 복사'; status.textContent = '코드를 복사하지 못했습니다. 직접 선택해 복사해 주세요.'; }
        reset = setTimeout(() => { button.textContent = '복사'; status.textContent = ''; },2200);
      });
      block.append(button);
    });
    container.querySelectorAll('[data-copy-link]').forEach(button => {
      if (button.dataset.copyReady) return;
      button.dataset.copyReady = 'true';
      button.hidden = false;
      button.addEventListener('click',async () => {
        const status = container.querySelector('[data-copy-status]');
        try { await navigator.clipboard.writeText(document.querySelector('link[rel="canonical"]').href); status.textContent = '글 주소를 복사했습니다.'; }
        catch { status.textContent = '주소창에서 글 주소를 복사해 주세요.'; }
      });
    });
  }
  enhanceArticle(document);
  document.addEventListener('articlemounted', event => {
    if (event.detail instanceof HTMLElement) enhanceArticle(event.detail);
  });
})();
