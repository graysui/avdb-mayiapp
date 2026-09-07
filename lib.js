/*!
 * AVDB 小程序 · 共享运行时 lib.js
 *
 * 模块：
 *   Cfg      — 配置管理（ant.storage 持久化）
 *   AVDB     — AVDB HTTP API 客户端
 *   P115     — 115 Web API 客户端（文件列表 + 直链）
 *   Player   — 直链播放封装
 *   UI       — 公共 UI 工具（toast / 卡片 / 骨架屏 / TV焦点）
 */
(function () {
  'use strict';

  /* ================================================================
     Log — 请求日志 & 诊断模块
     ================================================================ */
  var Log = (function () {
    var MAX = 80;
    var entries = [];          // 环形日志
    var listeners = [];        // 页面订阅

    function ts() { return new Date().toISOString().slice(11, 23); }

    function push(entry) {
      entries.push(entry);
      if (entries.length > MAX) entries.shift();
      listeners.forEach(function (fn) { try { fn(entry); } catch (e) {} });
    }

    function info(tag, msg) {
      push({ t: ts(), level: 'INFO', tag: tag, msg: String(msg) });
    }
    function warn(tag, msg) {
      push({ t: ts(), level: 'WARN', tag: tag, msg: String(msg) });
    }
    function error(tag, msg) {
      push({ t: ts(), level: 'ERROR', tag: tag, msg: String(msg) });
    }

    function getAll() { return entries.slice(); }
    function clear()  { entries = []; }
    function subscribe(fn) { listeners.push(fn); }
    function unsubscribe(fn) { listeners = listeners.filter(function (f) { return f !== fn; }); }

    /* ---- 拦截 ant.request，自动记录每次网络调用 ---- */
    function installInterceptor() {
      if (typeof window.ant === 'undefined' || !ant.request || ant.request.__logged) return;
      var _orig = ant.request.bind(ant);
      ant.request = function (opts) {
        var label = (opts.method || 'GET') + ' ' + (opts.url || '');
        var t0 = Date.now();
        info('NET', '→ ' + label);
        return _orig(opts).then(function (res) {
          var ms = Date.now() - t0;
          var preview = '';
          try {
            var body = typeof res.data === 'string' ? res.data.slice(0, 120) : JSON.stringify(res.data).slice(0, 120);
            preview = body;
          } catch (e) {}
          info('NET', '← ' + res.statusCode + ' ' + label + ' [' + ms + 'ms] ' + preview);
          return res;
        }, function (e) {
          var ms = Date.now() - t0;
          error('NET', '✗ ' + label + ' [' + ms + 'ms] ' + (e && e.message || String(e)));
          throw e;
        });
      };
      ant.request.__logged = true;
      info('LOG', '请求拦截器已安装');
    }

    return { info: info, warn: warn, error: error, getAll: getAll, clear: clear, subscribe: subscribe, unsubscribe: unsubscribe, installInterceptor: installInterceptor };
  })();


  /* ================================================================
     Cfg — 配置管理
     ================================================================ */
  var Cfg = (function () {
    var KEYS = {
      AVDB_URL:        'avdb_url',
      AVDB_KEY:        'avdb_key',
      P115_COOKIE:     'p115_cookie',
      P115_FOLDER_CID: 'p115_folder_cid',
      P115_SAVE_PATH:  'p115_save_path'
    };

    var data = {
      avdbUrl:       'http://my.gray728.top:18168',
      avdbKey:       'MAS2RIVNrJkFdBgC5MBf7PhTwyCFx80H',
      p115Cookie:    '',
      p115FolderCid: '3511237427370919738',
      p115SavePath:  '/18+/'
    };

    function load() {
      return Promise.all([
        ant.storage.get(KEYS.AVDB_URL),
        ant.storage.get(KEYS.AVDB_KEY),
        ant.storage.get(KEYS.P115_COOKIE),
        ant.storage.get(KEYS.P115_FOLDER_CID),
        ant.storage.get(KEYS.P115_SAVE_PATH)
      ]).then(function (vals) {
        if (vals[0]) data.avdbUrl       = vals[0].replace(/\/+$/, '');
        if (vals[1]) data.avdbKey       = vals[1];
        if (vals[2]) data.p115Cookie    = vals[2];
        if (vals[3]) data.p115FolderCid = vals[3];
        if (vals[4]) data.p115SavePath  = vals[4];
        return data;
      });
    }

    function save(patch) {
      var tasks = [];
      if (patch.avdbUrl       !== undefined) { data.avdbUrl       = patch.avdbUrl.replace(/\/+$/, ''); tasks.push(ant.storage.set(KEYS.AVDB_URL,        data.avdbUrl)); }
      if (patch.avdbKey       !== undefined) { data.avdbKey       = patch.avdbKey;       tasks.push(ant.storage.set(KEYS.AVDB_KEY,        data.avdbKey)); }
      if (patch.p115Cookie    !== undefined) { data.p115Cookie    = patch.p115Cookie;    tasks.push(ant.storage.set(KEYS.P115_COOKIE,     data.p115Cookie)); }
      if (patch.p115FolderCid !== undefined) { data.p115FolderCid = patch.p115FolderCid; tasks.push(ant.storage.set(KEYS.P115_FOLDER_CID, data.p115FolderCid)); }
      if (patch.p115SavePath  !== undefined) { data.p115SavePath  = patch.p115SavePath;  tasks.push(ant.storage.set(KEYS.P115_SAVE_PATH,  data.p115SavePath)); }
      return Promise.all(tasks).then(function () { return data; });
    }

    function has115Cookie() {
      return !!(data.p115Cookie && data.p115Cookie.indexOf('UID=') >= 0);
    }

    return { data: data, load: load, save: save, has115Cookie: has115Cookie };
  })();


  /* ================================================================
     AVDB — HTTP API 客户端
     ================================================================ */
  var AVDB = (function () {

    function request(path, opts) {
      var options = opts || {};
      var url = Cfg.data.avdbUrl + path;
      var headers = { 'X-API-Key': Cfg.data.avdbKey };
      if (options.json) headers['Content-Type'] = 'application/json';
      if (options.form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      Object.assign(headers, options.headers || {});

      return ant.request({
        url: url,
        method: options.method || 'GET',
        headers: headers,
        data: options.json
          ? JSON.stringify(options.json)
          : (options.form || options.data || undefined),
        timeout: 25000
      }).then(function (res) {
        if (res.statusCode >= 400) {
          var msg = 'HTTP ' + res.statusCode;
          try {
            var b = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            if (b && b.message) msg = b.message;
          } catch (e) {}
          var err = new Error(msg);
          err.status = res.statusCode;
          throw err;
        }
        var body = res.data;
        if (typeof body === 'string') {
          try { body = JSON.parse(body); } catch (e) {}
        }
        // 大多数业务接口包装在 data 字段里
        return (body && body.data !== undefined) ? body.data : body;
      });
    }

    /* ---------- JavDB 在线资源 ---------- */
    function getLatest(page, limit, filterBy) {
      var q = '?page=' + (page || 1) + '&limit=' + (limit || 24);
      if (filterBy) q += '&filter_by=' + filterBy;
      return request('/api/v1/javdb/movies/latest' + q);
    }

    function getRankings(period) {
      return request('/api/v1/javdb/rankings?period=' + (period || 'daily'));
    }

    function getRecommend() {
      return request('/api/v1/javdb/movies/recommend');
    }

    function search(q, page, limit) {
      var params = encodeURIComponent(q);
      return request('/api/v1/javdb/search?q=' + params +
        '&type=movie&page=' + (page || 1) + '&limit=' + (limit || 24));
    }

    function getMovie(movieId) {
      return request('/api/v1/javdb/movies/' + encodeURIComponent(movieId));
    }

    function getMagnets(movieId, number) {
      var q = number ? '?number=' + encodeURIComponent(number) : '';
      return request('/api/v1/javdb/movies/' + encodeURIComponent(movieId) + '/magnets' + q);
    }

    function syncCommentResources(movieId) {
      return request('/api/v1/javdb/movies/' + encodeURIComponent(movieId) + '/comment-resources/sync', {
        method: 'POST'
      });
    }

    function getCommentResources(movieId) {
      return request('/api/v1/javdb/movies/' + encodeURIComponent(movieId) + '/comment-resources');
    }

    /* ---------- 资源中心 ---------- */
    function searchArticles(opts) {
      return request('/api/v1/articles/search', {
        method: 'POST',
        json: {
          page:      opts.page      || 1,
          page_size: opts.pageSize  || 24,
          keyword:   opts.keyword   || null,
          section:   opts.section   || null,
          category:  opts.category  || null,
          in_stock:  opts.inStock   != null ? opts.inStock : null
        }
      });
    }

    function getArticleMagnets(tids) {
      return request('/api/v1/articles/magnets', {
        method: 'POST',
        json: { tids: tids }
      });
    }

    /* ---------- 发送到 115 ---------- */
    function sendMagnetTo115(magnet, savePath) {
      return request('/api/v1/articles/download/raw/manul', {
        method: 'POST',
        json: {
          magnet:     magnet,
          downloader: '115',
          save_path:  savePath || Cfg.data.p115SavePath
        }
      });
    }

    function sendTidTo115(tid) {
      return request('/api/v1/articles/download/manul?tid=' + tid +
        '&downloader=115&save_path=' + encodeURIComponent(Cfg.data.p115SavePath));
    }

    /* ---------- 统计 ---------- */
    function getStats() {
      return request('/api/v1/stats');
    }

    /* ---------- 图片代理 ---------- */
    function imgProxy(sourceUrl) {
      if (!sourceUrl) return '';
      return Cfg.data.avdbUrl + '/api/v1/img-proxy/?url=' + encodeURIComponent(sourceUrl);
    }

    return {
      request: request,
      getLatest: getLatest,
      getRankings: getRankings,
      getRecommend: getRecommend,
      search: search,
      getMovie: getMovie,
      getMagnets: getMagnets,
      syncCommentResources: syncCommentResources,
      getCommentResources: getCommentResources,
      searchArticles: searchArticles,
      getArticleMagnets: getArticleMagnets,
      sendMagnetTo115: sendMagnetTo115,
      sendTidTo115: sendTidTo115,
      getStats: getStats,
      imgProxy: imgProxy
    };
  })();

  /* ================================================================
     P115 — 115 Web API 客户端
     ================================================================ */
  var P115 = (function () {

    var UA_MOBILE = 'Mozilla/5.0 (Linux; Android 11; M2007J3SC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

    function cookie() {
      return Cfg.data.p115Cookie || '';
    }


    function req(url, opts) {
      var options = opts || {};
      var headers = {
        'Cookie':     cookie(),
        'User-Agent': UA_MOBILE,
        'Referer':    'https://115.com/'
      };
      Object.assign(headers, options.headers || {});

      return ant.request({
        url: url,
        method: options.method || 'GET',
        headers: headers,
        data: options.data,
        timeout: 20000
      }).then(function (res) {
        var body = res.data;
        if (typeof body === 'string') {
          try { body = JSON.parse(body); } catch (e) {}
        }
        if (body && body.state === false) {
          throw new Error(body.error || body.message || '115接口返回错误');
        }
        return body;
      });
    }

    /**
     * 搜索 / 列出文件
     * @param {string} keyword  搜索关键词（空则列目录）
     * @param {string} cid      目录 cid（默认用配置的下载目录）
     * @param {number} offset   分页偏移
     */
    function listFiles(keyword, cid, offset) {
      var params = [
        'limit=48',
        'offset=' + (offset || 0),
        'show_dir=0',
        'cid=' + (cid || Cfg.data.p115FolderCid)
      ];
      if (keyword) params.push('search_value=' + encodeURIComponent(keyword));
      return req('https://proapi.115.com/android/2.0/ufile/files?' + params.join('&'));
    }

    /**
     * 获取 115 直链
     * @param {string} pickcode  文件的 pick_code 字段
     * @returns {Promise<{url:string, ua:string}>}
     */
    function getDownloadUrl(pickcode) {
      return req('https://proapi.115.com/app/chrome/downurl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: 'pickcode=' + encodeURIComponent(pickcode)
      }).then(function (body) {
        // 响应结构: { state:true, data: { "<pickcode>": { url:{url,header} | url:string } } }
        var dataMap = body && body.data;
        if (!dataMap) throw new Error('115直链接口响应异常');

        var entry = dataMap[pickcode] || Object.values(dataMap)[0];
        if (!entry) throw new Error('未找到直链数据');

        var rawUrl = entry.url;
        var directUrl, ua;

        if (rawUrl && typeof rawUrl === 'object') {
          directUrl = rawUrl.url || rawUrl.URL || '';
          // header 字段格式: "User-Agent: xxx\r\n"
          var headerStr = rawUrl.header || rawUrl.headers || '';
          var match = String(headerStr).match(/User-Agent:\s*(.+)/i);
          ua = match ? match[1].trim() : UA_MOBILE;
        } else if (typeof rawUrl === 'string') {
          directUrl = rawUrl;
          ua = UA_MOBILE;
        } else {
          throw new Error('无法解析直链格式');
        }

        if (!directUrl) throw new Error('直链为空');
        return { url: directUrl, ua: ua };
      });
    }

    /**
     * 验证 Cookie 是否有效（列根目录，成功即可）
     */
    function testCookie() {
      return req('https://proapi.115.com/android/2.0/ufile/files?cid=0&limit=1&show_dir=1');
    }

    return {
      UA_MOBILE: UA_MOBILE,
      listFiles: listFiles,
      getDownloadUrl: getDownloadUrl,
      testCookie: testCookie
    };
  })();

  /* ================================================================
     Player — 直链播放
     ================================================================ */
  var Player = {
    playDirect: function (url, title, ua) {
      if (!url) return Promise.reject(new Error('直链为空'));
      var headers = {};
      if (ua) headers['User-Agent'] = ua;
      return ant.player.open({ url: url, title: title || '播放', headers: headers });
    }
  };

  /* ================================================================
     UI — 公共界面工具
     ================================================================ */
  var UI = (function () {

    function esc(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function qs(name) {
      var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    }

    function toast(msg) {
      try { ant.ui.toast(msg); } catch (e) { console.warn('[AVDB]', msg); }
    }

    function errText(e) {
      if (!e) return '未知错误';
      return (e.code ? e.code + ' · ' : '') + (e.message || String(e));
    }

    function loading(msg) {
      try { ant.ui.loading(msg || '加载中…'); } catch (e) {}
    }

    function hideLoading() {
      try { ant.ui.hideLoading(); } catch (e) {}
    }

    /* ---- 状态占位 ---- */
    function stateHtml(icon, title, detail, actionHtml) {
      return '<div class="state"><div class="ico">' + icon + '</div>' +
        '<h3>' + esc(title) + '</h3><p>' + detail + '</p>' +
        (actionHtml || '') + '</div>';
    }

    /* ---- 封面 HTML ---- */
    function posterHtml(item, extraClass) {
      var pic = item.cover || item.vod_pic || item.preview_url || '';
      var name = item.title || item.vod_name || item.number || '';
      var inner = pic
        ? '<img loading="lazy" src="' + esc(pic) + '" alt="" ' +
          'onerror="this.parentNode.innerHTML=\'<div class=\\"ph\\">' +
          esc(name.slice(0, 1)) + '</div>\'"/>'
        : '<div class="ph">' + esc(name.slice(0, 1)) + '</div>';
      var badge = item.score
        ? '<div class="badge">⭐' + item.score + '</div>' : '';
      var tagHd = item.is_hd || item.meta_hd
        ? '<div class="tag-hd">HD</div>' : '';
      var tagSub = item.has_subtitle || item.meta_zh_sub
        ? '<div class="tag-sub">字</div>' : '';
      return '<div class="poster' + (extraClass ? ' ' + extraClass : '') + '">' +
        inner + badge + tagHd + tagSub + '</div>';
    }

    /* ---- 卡片 HTML ---- */
    function cardHtml(item, index) {
      var name = item.title || item.vod_name || item.number || '未命名';
      var sub  = item.number || item.vod_year || item.actor_name || '';
      return '<button data-focus class="card" data-index="' + index + '">' +
        posterHtml(item) +
        '<div class="card-name">' + esc(name) + '</div>' +
        (sub ? '<div class="card-sub">' + esc(sub) + '</div>' : '') +
        '</button>';
    }

    /* ---- 渲染卡片列表 ---- */
    function renderCards(container, list, onClick) {
      if (!container) return;
      if (!list || !list.length) {
        container.innerHTML = '<div class="hint">暂无内容</div>';
        return;
      }
      container.innerHTML = list.map(cardHtml).join('');
      container.querySelectorAll('.card').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (onClick) onClick(list[Number(btn.dataset.index)], Number(btn.dataset.index));
        });
      });
    }

    /* ---- 骨架屏 ---- */
    function skeleton(count, cls) {
      var one = '<div><div class="sk sk-poster"></div>' +
        '<div class="sk sk-line" style="width:80%"></div>' +
        '<div class="sk sk-line" style="width:55%"></div></div>';
      var cells = '';
      for (var i = 0; i < count; i++) cells += one;
      return cls === null ? cells : '<div class="' + (cls || 'rail') + '">' + cells + '</div>';
    }

    /* ---- 加载行 ---- */
    function loadingRow() {
      return '<div class="loading-row"><div class="spinner"></div>加载中…</div>';
    }

    /* ---- 顶栏渲染 ---- */
    function renderHeader(active) {
      var host = document.getElementById('app-header');
      if (!host) return;
      var tabs = [
        { id: 'index',     name: '首页',   href: 'index.html' },
        { id: 'online',    name: '在线',   href: 'online.html' },
        { id: 'resources', name: '资源库', href: 'resources.html' },
        { id: 'settings',  name: '设置',   href: 'settings.html' }
      ];
      host.className = 'header';
      host.innerHTML =
        '<div class="brand"><i>🐜</i>AVDB</div>' +
        '<nav class="nav">' +
        tabs.map(function (t) {
          return '<a data-focus href="' + t.href + '" class="' +
            (t.id === active ? 'on' : '') + '">' + t.name + '</a>';
        }).join('') +
        '</nav>';
    }

    /* ====== TV 焦点系统 ====== */
    var _focusEl = null;

    function focusCandidates() {
      return Array.prototype.filter.call(
        document.querySelectorAll('[data-focus]'),
        function (n) { var r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
      );
    }

    function centerOf(n) {
      var r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function setFocus(node) {
      if (!node) return;
      if (_focusEl) _focusEl.classList.remove('tv-focus');
      _focusEl = node;
      node.classList.add('tv-focus');
      try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function moveFocus(dir) {
      var items = focusCandidates();
      if (!items.length) return;
      if (!_focusEl || items.indexOf(_focusEl) < 0) { setFocus(items[0]); return; }
      var from = centerOf(_focusEl), best = null, bestScore = Infinity;
      items.forEach(function (n) {
        if (n === _focusEl) return;
        var to = centerOf(n), dx = to.x - from.x, dy = to.y - from.y;
        var main, cross;
        if (dir === 'ArrowLeft')  { main = -dx; cross = Math.abs(dy); }
        else if (dir === 'ArrowRight') { main = dx;  cross = Math.abs(dy); }
        else if (dir === 'ArrowUp')    { main = -dy; cross = Math.abs(dx); }
        else                           { main = dy;  cross = Math.abs(dx); }
        if (main <= 2) return;
        var score = main + cross * 2.2;
        if (score < bestScore) { bestScore = score; best = n; }
      });
      if (best) setFocus(best);
    }

    function initTvFocus() {
      if (!window.ant || !ant.tv || initTvFocus._done) return;
      initTvFocus._done = true;
      ant.tv.onKey(function (ev) {
        var key = ev && ev.key;
        if (key === 'Enter') { if (_focusEl) _focusEl.click(); else moveFocus('ArrowDown'); return; }
        if (key && key.indexOf('Arrow') === 0) moveFocus(key);
      });
      document.addEventListener('click', function (ev) {
        var n = ev.target && ev.target.closest ? ev.target.closest('[data-focus]') : null;
        if (n) setFocus(n);
      }, true);
    }

    /* ---- 格式化文件大小 ---- */
    function fmtSize(bytes) {
      if (!bytes) return '';
      var b = Number(bytes);
      if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
      if (b >= 1048576)    return (b / 1048576).toFixed(0) + ' MB';
      return (b / 1024).toFixed(0) + ' KB';
    }

    /* ---- 磁力 hash 提取 ---- */
    function magnetHash(magnet) {
      var m = String(magnet || '').match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
      return m ? m[1].toLowerCase() : '';
    }

    /* ---- 导航 ---- */
    function goMovie(movieId) {
      ant.navigateTo('movie.html?id=' + encodeURIComponent(movieId));
    }

    /* ---- 启动检查：AVDB地址是否已设置 ---- */
    function checkConfig(main) {
      if (!Cfg.data.avdbUrl) {
        if (main) main.innerHTML = stateHtml('⚙️', '请先完成设置',
          '在「设置」页填写 AVDB 地址后再使用。',
          '<a data-focus class="btn btn-primary" href="settings.html">前往设置</a>');
        return false;
      }
      return true;
    }

    return {
      esc: esc, qs: qs, toast: toast, errText: errText,
      loading: loading, hideLoading: hideLoading,
      stateHtml: stateHtml, posterHtml: posterHtml, cardHtml: cardHtml,
      renderCards: renderCards, skeleton: skeleton, loadingRow: loadingRow,
      renderHeader: renderHeader, setFocus: setFocus, initTvFocus: initTvFocus,
      fmtSize: fmtSize, magnetHash: magnetHash,
      goMovie: goMovie, checkConfig: checkConfig
    };
  })();

  /* ================================================================
     导出
     ================================================================ */
  // 拦截器在 ant 可用时立即安装
  if (typeof window.ant !== 'undefined') Log.installInterceptor();

  window.AVDBApp = { Cfg: Cfg, AVDB: AVDB, P115: P115, Player: Player, UI: UI, Log: Log };

})();
