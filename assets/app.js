/* FoHK Viewer — static, in-memory search over the extracted Flora of Hong Kong text. */
(function () {
  'use strict';

  var MAX_RESULTS = 300;
  var state = {
    records: [], byKey: new Map(), familyByName: new Map(), genusByName: new Map(),
    filtered: [], rank: 'all', query: '', textOnly: true,
    active: -1, selectedKey: null, tokens: []
  };

  var $ = function (id) { return document.getElementById(id); };
  var resultsEl = $('results');
  var searchEl = $('search');
  var countEl = $('result-count');
  var noteEl = $('list-note');
  var detailEl = $('detail');
  var loadingEl = $('loading');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLocaleLowerCase(); }

  function highlight(el, text, tokens) {
    text = String(text == null ? '' : text);
    if (!tokens.length) { el.textContent = text; return; }
    var pattern = tokens.slice().sort(function (a, b) { return b.length - a.length; })
      .map(escapeRe).join('|');
    var re = new RegExp('(' + pattern + ')', 'gi');
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      var mark = document.createElement('mark');
      mark.textContent = m[0];
      el.appendChild(mark);
      last = m.index + m[0].length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }

  function prepare(payload) {
    state.records = payload.records || [];
    state.byKey.clear(); state.familyByName.clear(); state.genusByName.clear();
    state.records.forEach(function (r) {
      r.key = r.rank + '-' + r.id;
      r._sci = norm(r.sci); r._chi = norm(r.chi); r._sc = norm(r.sc);
      r._hay = norm([r.sci, r.chi, r.sc, r.authority, r.family, r.genus, r.id].join(' '));
      state.byKey.set(r.key, r);
      if (r.rank === 'family' && r.sci) state.familyByName.set(norm(r.sci), r.key);
      if (r.rank === 'genus' && r.sci) state.genusByName.set(norm(r.sci), r.key);
    });
    if (payload.meta && payload.meta.generated) {
      $('build-stamp').textContent = 'Data: ' + payload.meta.generated;
    }
  }

  function score(r, tokens) {
    var s = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (r._sci === t || r._chi === t || r._sc === t) s += 120;
      else if (r._sci.indexOf(t) === 0 || r._chi.indexOf(t) === 0 || r._sc.indexOf(t) === 0) s += 70;
      else if (r._sci.indexOf(t) >= 0 || r._chi.indexOf(t) >= 0 || r._sc.indexOf(t) >= 0) s += 35;
      else s += 8; // matched family, genus or id
    }
    if (r.text && r.text.trim()) s += 2;
    return s;
  }

  function subtitle(r) {
    if (r.rank === 'family') {
      return [r.group, r.n_species ? r.n_species + ' spp' : '', '#' + r.id].filter(Boolean).join(' · ');
    }
    if (r.rank === 'genus') {
      return [r.family, '#' + r.id].filter(Boolean).join(' · ');
    }
    return [r.family, r.genus, '#' + r.id].filter(Boolean).join(' · ');
  }

  function runSearch() {
    state.query = searchEl.value;
    state.tokens = norm(state.query).split(/\s+/).filter(Boolean);
    var list = state.records.filter(function (r) {
      if (state.rank !== 'all' && r.rank !== state.rank) return false;
      if (state.textOnly && !(r.text && r.text.trim())) return false;
      if (state.tokens.length) {
        for (var i = 0; i < state.tokens.length; i++) {
          if (r._hay.indexOf(state.tokens[i]) < 0) return false;
        }
      }
      return true;
    });
    if (state.tokens.length) {
      list = list.map(function (r) { return { r: r, s: score(r, state.tokens) }; })
        .sort(function (a, b) {
          return b.s - a.s || a.r.sci.localeCompare(b.r.sci) || a.r.id.localeCompare(b.r.id);
        })
        .map(function (x) { return x.r; });
    }
    state.filtered = list;
    state.active = list.findIndex(function (r) { return r.key === state.selectedKey; });
    renderList();
  }

  function makeBadge(rank) {
    var b = document.createElement('span');
    b.className = 'badge rank-' + rank;
    b.textContent = rank;
    return b;
  }

  function renderList() {
    var total = state.filtered.length;
    var shown = Math.min(total, MAX_RESULTS);
    countEl.textContent = 'Showing ' + shown + ' / ' + total + ' of ' + state.records.length;
    noteEl.hidden = total <= MAX_RESULTS;
    if (!noteEl.hidden) noteEl.textContent = 'First ' + MAX_RESULTS + ' shown — refine your search for more.';
    resultsEl.replaceChildren();

    if (!total) {
      var empty = document.createElement('div');
      empty.className = 'list-note';
      empty.style.border = '0';
      empty.textContent = 'No matches. Try a different name, or turn off “Has text only”.';
      resultsEl.appendChild(empty);
      return;
    }

    var frag = document.createDocumentFragment();
    for (var i = 0; i < shown; i++) {
      var r = state.filtered[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'res' + (r.key === state.selectedKey ? ' is-active' : '');
      btn.dataset.key = r.key;
      btn.dataset.index = String(i);
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', r.key === state.selectedKey ? 'true' : 'false');

      var top = document.createElement('span');
      top.className = 'res-top';
      var zh = document.createElement('span');
      zh.className = 'res-zh';
      highlight(zh, r.chi || r.sci, state.tokens);
      var sci = document.createElement('span');
      sci.className = 'res-sci';
      highlight(sci, r.sci, state.tokens);
      top.appendChild(zh); top.appendChild(sci);

      var sub = document.createElement('span');
      sub.className = 'res-sub';
      highlight(sub, subtitle(r), state.tokens);

      btn.appendChild(top);
      btn.appendChild(sub);
      btn.appendChild(makeBadge(r.rank));
      if (!(r.text && r.text.trim())) {
        var nb = document.createElement('span');
        nb.className = 'badge no-text';
        nb.textContent = 'no text';
        btn.appendChild(nb);
      }
      frag.appendChild(btn);
    }
    resultsEl.appendChild(frag);
  }

  function crumb(key, label) {
    if (!key) return null;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'crumb'; b.dataset.key = key; b.textContent = label;
    return b;
  }

  function renderDetail(r) {
    detailEl.replaceChildren();
    detailEl.hidden = false;

    var crumbs = document.createElement('nav');
    crumbs.className = 'crumbs';
    var famKey = r.rank === 'family' ? r.key : state.familyByName.get(norm(r.family));
    var genKey = r.rank === 'genus' ? r.key : state.genusByName.get(norm(r.genus));
    if (famKey) {
      var cf = crumb(famKey, r.family || r.sci);
      if (cf) crumbs.appendChild(cf);
    }
    if (genKey && r.rank === 'species') {
      var sep1 = document.createElement('span'); sep1.className = 'sep'; sep1.textContent = '›';
      crumbs.appendChild(sep1);
      var cg = crumb(genKey, r.genus || r.sci);
      if (cg) crumbs.appendChild(cg);
    }
    if (famKey || genKey) {
      var sep2 = document.createElement('span'); sep2.className = 'sep'; sep2.textContent = '›';
      crumbs.appendChild(sep2);
    }
    var staticRank = document.createElement('span');
    staticRank.className = 'crumb-static';
    staticRank.textContent = r.rank;
    crumbs.appendChild(staticRank);
    detailEl.appendChild(crumbs);

    var head = document.createElement('div');
    head.className = 'detail-head';
    var rankLine = document.createElement('div');
    rankLine.className = 'rank-line';
    rankLine.appendChild(makeBadge(r.rank));
    var idBadge = document.createElement('span');
    idBadge.className = 'badge';
    idBadge.textContent = 'ID ' + r.id;
    rankLine.appendChild(idBadge);
    head.appendChild(rankLine);

    var h2 = document.createElement('h2');
    var ital = document.createElement('i');
    ital.textContent = r.sci;
    h2.appendChild(ital);
    if (r.authority) {
      var auth = document.createElement('span');
      auth.className = 'auth'; auth.textContent = ' ' + r.authority;
      h2.appendChild(auth);
    }
    head.appendChild(h2);

    if (r.chi || (r.sc && r.sc !== r.chi)) {
      var zh = document.createElement('p');
      zh.className = 'zh-names';
      zh.appendChild(document.createTextNode(r.chi || r.sc));
      if (r.sc && r.sc !== r.chi) {
        var sc = document.createElement('span');
        sc.className = 'sc'; sc.textContent = '(' + r.sc + ')';
        zh.appendChild(sc);
      }
      head.appendChild(zh);
    }

    var meta = document.createElement('div');
    meta.className = 'meta-line';
    var bits = [];
    if (r.group) bits.push(esc(r.group));
    if (r.n_species) bits.push(esc(r.n_species) + ' species in key');
    if (r.status) bits.push(esc(r.status));
    if (r.uses) bits.push('Uses: ' + esc(r.uses.replace(/<\/?[^>]+>/g, '')));
    if (r.food && r.food !== 'Other') bits.push(esc(r.food));
    if (bits.length) {
      var metaText = document.createElement('span');
      metaText.innerHTML = bits.join(' &middot; ');
      meta.appendChild(metaText);
    }
    if (r.source) {
      var link = document.createElement('a');
      link.href = r.source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'HK Herbarium ↗';
      meta.appendChild(link);
    }
    head.appendChild(meta);
    detailEl.appendChild(head);

    var actions = document.createElement('div');
    actions.className = 'detail-actions';

    if (r.text && r.text.trim()) {
      var body = document.createElement('div');
      body.className = 'body';
      body.id = 'body-text';
      body.innerHTML = r.text; // sanitised to a tag/attribute whitelist in build_data.py
      detailEl.appendChild(body);

      var copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'btn'; copy.id = 'copy-btn';
      copy.textContent = 'Copy plain text';
      actions.appendChild(copy);
    } else {
      var empty = document.createElement('div');
      empty.className = 'empty-note';
      empty.innerHTML = '<strong>No FoHK paragraph in this extract.</strong><br>' +
        'This record exists in the herbarium list but has no local treatment text.' +
        (r.source ? ' You can open the herbarium record with the link above.' : '');
      detailEl.appendChild(empty);
    }
    detailEl.appendChild(actions);
  }

  function selectRecord(r, updateHash) {
    if (!r) return;
    state.selectedKey = r.key;
    state.active = state.filtered.findIndex(function (x) { return x.key === r.key; });
    renderDetail(r);
    Array.prototype.forEach.call(resultsEl.querySelectorAll('.res'), function (el) {
      var on = el.dataset.key === r.key;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (updateHash !== false) {
      try { history.replaceState(null, '', '#' + r.key); } catch (e) { /* file:// */ }
    }
  }

  function moveActive(step) {
    if (!state.filtered.length) return;
    var next = state.active + step;
    if (next < 0) next = 0;
    if (next >= state.filtered.length) next = state.filtered.length - 1;
    if (next === state.active && step !== 0) return;
    state.active = next;
    selectRecord(state.filtered[next], true);
    var row = resultsEl.querySelector('.res[data-index="' + next + '"]');
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  function selectFromHash() {
    var key = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (state.byKey.has(key)) {
      var r = state.byKey.get(key);
      if (state.textOnly && !(r.text && r.text.trim())) {
        $('text-only').checked = false; state.textOnly = false; runSearch();
      }
      selectRecord(r, false);
      return true;
    }
    return false;
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('fohk-theme', theme); } catch (e) { /* ignore */ }
    $('theme-btn').textContent = theme === 'dark' ? '☾' : '☀';
  }

  function wireEvents() {
    searchEl.addEventListener('input', runSearch);

    $('rank-filters').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg');
      if (!btn) return;
      state.rank = btn.dataset.rank;
      Array.prototype.forEach.call(this.querySelectorAll('.seg'), function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      runSearch();
    });

    $('text-only').addEventListener('change', function () {
      state.textOnly = this.checked;
      runSearch();
    });

    resultsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.res');
      if (btn) selectRecord(state.byKey.get(btn.dataset.key), true);
    });

    detailEl.addEventListener('click', function (e) {
      var cr = e.target.closest('.crumb');
      if (cr) {
        var r = state.byKey.get(cr.dataset.key);
        if (r) {
          if (state.rank !== 'all' && state.rank !== r.rank) {
            state.rank = 'all';
            Array.prototype.forEach.call(document.querySelectorAll('#rank-filters .seg'), function (b) {
              b.classList.toggle('is-active', b.dataset.rank === 'all');
            });
          }
          if (state.textOnly && !(r.text && r.text.trim())) {
            $('text-only').checked = false; state.textOnly = false;
          }
          runSearch(); selectRecord(r, true);
        }
        return;
      }
      var copy = e.target.closest('#copy-btn');
      if (copy) {
        var body = $('body-text');
        if (!body || !navigator.clipboard) return;
        navigator.clipboard.writeText(body.innerText).then(function () {
          copy.textContent = 'Copied ✓';
          setTimeout(function () { copy.textContent = 'Copy plain text'; }, 1400);
        });
      }
    });

    $('random-btn').addEventListener('click', function () {
      var pool = state.records.filter(function (r) { return r.text && r.text.trim(); });
      if (!pool.length) return;
      var r = pool[Math.floor(Math.random() * pool.length)];
      if (state.textOnly) { runSearch(); }
      if (state.rank !== 'all' && state.rank !== r.rank) {
        state.rank = 'all';
        Array.prototype.forEach.call(document.querySelectorAll('#rank-filters .seg'), function (b) {
          b.classList.toggle('is-active', b.dataset.rank === 'all');
        });
        runSearch();
      }
      searchEl.value = '';
      runSearch();
      selectRecord(r, true);
    });

    $('theme-btn').addEventListener('click', function () {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    window.addEventListener('hashchange', function () {
      if (!state.records.length) return;
      if (!selectFromHash()) runSearch();
    });

    document.addEventListener('keydown', function (e) {
      var inInput = document.activeElement === searchEl;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); searchEl.focus(); searchEl.select(); return;
      }
      if (e.key === '/' && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); searchEl.focus(); searchEl.select(); return;
      }
      if (e.key === 'Escape') {
        if (inInput && searchEl.value) { searchEl.value = ''; runSearch(); }
        else if (inInput) searchEl.blur();
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); return; }
      if (e.key === 'Enter' && inInput && state.active >= 0) {
        e.preventDefault(); selectRecord(state.filtered[state.active], true);
      }
    });
  }

  function showError(err) {
    loadingEl.hidden = true;
    var box = document.createElement('div');
    box.className = 'error-box';
    box.innerHTML = '<h2>Could not load the data</h2><p>' + esc(err && err.message ? err.message : err) +
      '</p><p>Serve this folder over HTTP, for example:</p><p><code>cd ' +
      esc(location.pathname.replace(/\/index\.html$/, '')) +
      ' &amp;&amp; python3 -m http.server 8771</code></p>' +
      '<p>Then open <code>http://127.0.0.1:8771/</code>. Opening index.html directly from disk ' +
      'does not work because browsers block <code>fetch()</code> on <code>file://</code>.</p>';
    document.querySelector('.content').appendChild(box);
  }

  function init() {
    var saved = null;
    try { saved = localStorage.getItem('fohk-theme'); } catch (e) { /* ignore */ }
    setTheme(saved === 'dark' || saved === 'light' ? saved :
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    wireEvents();

    fetch('data/fohk.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' while fetching data/fohk.json');
        return res.json();
      })
      .then(function (payload) {
        prepare(payload);
        runSearch();
        if (!selectFromHash() && state.filtered.length) {
          selectRecord(state.filtered.find(function (r) { return r.text && r.text.trim(); }) || state.filtered[0], false);
        }
        loadingEl.hidden = true;
      })
      .catch(showError);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
