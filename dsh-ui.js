/*!
 * dsh-ui.js —— 咖咯德苏林维基的统一界面
 * 布局参考 DeepSeek Harness Web GUI：左侧深色导航栏 / 中间正文 / 右侧目录栏 / 底部输入条。
 *
 * 用法：
 *   1. 页面 </body> 之前加一行（在 pages/xxx/ 里的页面用 ../../）
 *        <script src="dsh-ui.js"></script>
 *        <script src="../../dsh-ui.js"></script>
 *   2. 页面 <head> 里写一段 JSON，声明自己的名字与简介（也可以不写）：
 *        <script type="application/json" id="page-meta">
 *        { "name": "首页", "descript": "站点介绍与页面索引" }
 *        </script>
 *      name 省略时：pages/<文件夹>/index.html 用文件夹名，其余用文件名（去掉 .html）。
 *      descript 省略时索引卡片显示页面路径。group 可选，用来分栏（默认 WIKI.defaultGroup）。
 *   页面本身只写正文（h1 / h2 / p / ul …），不要写 <style>，界面样式全部由本文件注入。
 *
 * 页面清单不用手动维护，按优先级自动发现：
 *   GitHub API（仅 *.github.io）→ pages.json（可选清单）→ localStorage 自注册
 *   支持根目录的 *.html，也支持 pages/<名称>/index.html 这种一页一文件夹的结构。
 */
(function () {
    'use strict';

    // dsh-ui.js 自己所在的目录就是站点根目录，用它算相对路径，子目录页面也能点对
    var BASE_URL = (function () {
        var s = document.currentScript;
        if (!s || !s.src) {
            var all = document.getElementsByTagName('script');
            for (var i = all.length - 1; i >= 0; i--) {
                if (/dsh-ui\.js(\?|#|$)/.test(all[i].src || '')) { s = all[i]; break; }
            }
        }
        return s && s.src ? s.src.replace(/[^/]*$/, '') : '';
    })();

    /* ============================== 配置 ============================== */
    var WIKI = {
        brand: 'caldsonwiki',            // 侧栏左上角站名
        meta: 'WIKI',                    // 站名后面的小标签
        pageBadge: '静态站点',            // 顶栏标题右侧的小标签
        home: 'index.html',              // 首页地址（相对站点根目录）
        pagesDir: 'pages',               // 一页一文件夹时，页面都放在这个目录下
        searchPlaceholder: '搜索本站页面，Enter 打开第一个结果',
        defaultGroup: '页面',             // 没有 group 的页面归到这一组
        manifest: 'pages.json',          // 可选清单，存在就用（见 README）
        repo: '',                        // 可选：'owner/name'，自定义域名下想让 GitHub API 生效时填
        probeLimit: 12,                  // 最多顺带抓取多少个页面的 head JSON
        cacheHours: 6                    // GitHub 文件列表的缓存时长
    };
    /* ================================================================= */

    var THEME_KEY = 'caldsonwiki.theme';
    var SIDE_KEY = 'caldsonwiki.sidebar';
    var styleDone = false;

    /* ------------------------------ 小工具 ------------------------------ */

    function svg(d) {
        return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" ' +
            'stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
            d + '</svg>';
    }

    var ICONS = {
        panel: svg('<rect x="2" y="3.2" width="12" height="9.6" rx="1.8"/><path d="M6.4 3.2v9.6"/>'),
        home: svg('<path d="M3 7.3 8 3.2l5 4.1v5.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>'),
        folder: svg('<path d="M2.2 4.6A1.6 1.6 0 0 1 3.8 3h2l1.2 1.6h5.2a1.6 1.6 0 0 1 1.6 1.6v5A1.6 1.6 0 0 1 12.2 13H3.8a1.6 1.6 0 0 1-1.6-1.6Z"/>'),
        doc: svg('<path d="M9.3 2.6H5a1 1 0 0 0-1 1v8.8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5.3Z"/><path d="M9.3 2.6v2.7H12"/>'),
        bubble: svg('<path d="M13.2 8.2A4.6 4.6 0 0 1 6.9 12.6L3.4 13.4l1-2.9A4.6 4.6 0 1 1 13.2 8.2Z"/>'),
        search: svg('<circle cx="7.2" cy="7.2" r="4.1"/><path d="m10.3 10.3 3 3"/>'),
        up: svg('<path d="M8 12.6V3.4M4.6 6.8 8 3.4l3.4 3.4"/>'),
        gear: svg('<circle cx="8" cy="8" r="2.3"/><path d="M8 1.9v1.5M8 12.6v1.5M1.9 8h1.5M12.6 8h1.5M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1"/>'),
        moon: svg('<path d="M13 9.4A5.4 5.4 0 0 1 6.6 3 5.5 5.5 0 1 0 13 9.4Z"/>'),
        sun: svg('<circle cx="8" cy="8" r="3.1"/><path d="M8 1.7v1.4M8 12.9v1.4M1.7 8h1.4M12.9 8h1.4M3.5 3.5l1 1M11.5 11.5l1 1M12.5 3.5l-1 1M4.5 11.5l-1 1"/>'),
        info: svg('<circle cx="8" cy="8" r="6"/><path d="M8 7.3v4M8 5.1v.02"/>')
    };

    // 极简 createElement：attrs 支持 class / text / html / dataset / 普通属性
    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                var v = attrs[k];
                if (v === null || v === undefined || v === false) return;
                if (k === 'class') node.className = v;
                else if (k === 'text') node.textContent = v;
                else if (k === 'html') node.innerHTML = v;
                else if (k === 'dataset') Object.assign(node.dataset, v);
                else node.setAttribute(k, v === true ? '' : v);
            });
        }
        if (children) {
            (Array.isArray(children) ? children : [children]).forEach(function (c) {
                if (c === null || c === undefined || c === false) return;
                node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
            });
        }
        return node;
    }

    function iconBtn(cls, act, title, icon) {
        return el('button', {
            type: 'button', class: cls, title: title, 'aria-label': title,
            html: icon, dataset: { act: act }
        });
    }

    function pagePath() {
        var href = location.href.split('#')[0].split('?')[0];
        var rel;
        if (BASE_URL && href.indexOf(BASE_URL) === 0) rel = href.slice(BASE_URL.length);
        else if (BASE_URL && href + '/' === BASE_URL) rel = 'index.html';
        else rel = href.split('/').pop() || '';
        try { rel = decodeURIComponent(rel); } catch (e) { /* 解不开就按原样用 */ }
        if (!rel || rel.charAt(rel.length - 1) === '/') rel += 'index.html';
        return rel.replace(/^\.?\//, '');
    }

    function isCurrent(path) {
        return String(path || '').toLowerCase() === pagePath().toLowerCase();
    }

    function stripExt(file) {
        return String(file || '').replace(/\.html?$/i, '');
    }

    // pages/首页/index.html → 「首页」；about.html → 「about」
    function fallbackName(path) {
        var segs = String(path || '').split('/').filter(Boolean);
        if (segs.length > 1 && /^index\.html?$/i.test(segs[segs.length - 1])) return segs[segs.length - 2];
        return stripExt(segs[segs.length - 1] || '');
    }

    // 把各种写法都归一成「相对站点根目录的路径」
    function normalizePath(v) {
        var s = String(v || '').trim().replace(/^\.?\//, '');
        if (!s) return '';
        if (s.charAt(s.length - 1) === '/') return s + 'index.html';
        if (s.indexOf('/') === -1 && !/\.html?$/i.test(s)) {
            // 只写了名字，例如 "首页" → pages/首页/index.html
            return (WIKI.pagesDir ? WIKI.pagesDir + '/' : '') + s + '/index.html';
        }
        return s;
    }

    // 从 fromDir 走到 toPath 的相对链接，保证子目录里的页面也点得对
    function relativeFrom(fromDir, toPath) {
        var from = String(fromDir || '').split('/').filter(Boolean);
        var to = String(toPath || '').split('/').filter(Boolean);
        var i = 0;
        while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
        var up = '';
        for (var j = i; j < from.length; j++) up += '../';
        return up + to.slice(i).join('/');
    }

    function hrefFor(path) {
        return relativeFrom(pagePath().replace(/[^/]*$/, ''), path);
    }

    // 读取一段 HTML 里声明的页面信息（当前文档、或抓回来的文档都能用）
    function readMetaFrom(doc) {
        var out = { name: '', descript: '', group: '' };
        var one = doc.getElementById('page-meta') || doc.getElementById('dsh-page-meta');
        var nodes = one ? [one] : doc.querySelectorAll('head script[type="application/json"]');
        for (var i = 0; i < nodes.length; i++) {
            var data;
            try { data = JSON.parse(nodes[i].textContent || '{}'); } catch (e) { continue; }
            if (!data || typeof data !== 'object') continue;
            var name = typeof data.name === 'string' ? data.name.trim() : '';
            var descript = String(data.descript || data.description || data.desc || '').trim();
            if (!name && !descript) continue;          // 不是页面信息，跳过
            out.name = name;
            out.descript = descript;
            out.group = typeof data.group === 'string' ? data.group.trim() : '';
            break;
        }
        return out;
    }

    // 当前页面自己的信息：name 缺省用文件夹名 / 文件名
    function selfEntry() {
        var path = pagePath();
        var m = readMetaFrom(document);
        return { path: path, name: m.name || fallbackName(path), descript: m.descript, group: m.group };
    }

    /* ---------------- localStorage 自注册 ---------------- */

    var REG_KEY = 'caldsonwiki.pages';
    var GH_KEY = 'caldsonwiki.gh';

    function loadRegistry() {
        try {
            var raw = JSON.parse(localStorage.getItem(REG_KEY) || '{}');
            return raw && typeof raw === 'object' ? raw : {};
        } catch (e) { return {}; }
    }

    function saveRegistry(reg) {
        try { localStorage.setItem(REG_KEY, JSON.stringify(reg)); } catch (e) { /* 忽略隐私模式报错 */ }
    }

    function registryList() {
        var reg = loadRegistry();
        return Object.keys(reg).map(function (path) {
            var it = reg[path] || {};
            return { path: path, name: it.name || '', descript: it.descript || '', group: it.group || '' };
        });
    }

    // 把这一轮发现到的信息登记进本地，下次打开（含 file://）就有清单
    function rememberPages(list) {
        var reg = loadRegistry();
        var changed = false;
        list.forEach(function (p) {
            if (!p || !p.path) return;
            var old = reg[p.path];
            if (!old || old.name !== p.name || old.descript !== p.descript || old.group !== p.group) {
                reg[p.path] = { name: p.name || '', descript: p.descript || '', group: p.group || '' };
                changed = true;
            }
        });
        if (changed) saveRegistry(reg);
        return reg;
    }

    // sources 从低优先级到高优先级，后面的来源只覆盖前面留空的字段
    function collect(sources) {
        var byKey = {}, order = [];
        sources.forEach(function (list) {
            (list || []).forEach(function (e) {
                if (!e) return;
                var path = normalizePath(e.path || e.file || e.href);
                if (!path || !/\.html?$/i.test(path)) return;
                if (/(^|\/)[._]/.test(path)) return;                     // 跳过 . / _ 开头的临时文件与目录
                if (/(^|\/)404\.html?$/i.test(path)) return;
                var key = path.toLowerCase();
                if (!byKey[key]) { byKey[key] = { path: path, name: '', descript: '', group: '' }; order.push(key); }
                var t = byKey[key];
                if (e.name) t.name = e.name;
                if (e.descript) t.descript = e.descript;
                if (e.group) t.group = e.group;
            });
        });
        var list = order.map(function (k) {
            var p = byKey[k];
            if (!p.name) p.name = fallbackName(p.path);   // 没写 name：文件夹页面用文件夹名，其余用文件名
            return p;
        });
        var home = String(WIKI.home || '').toLowerCase();
        list.sort(function (a, b) {
            var ah = a.path.toLowerCase() === home ? 0 : 1;
            var bh = b.path.toLowerCase() === home ? 0 : 1;
            if (ah !== bh) return ah - bh;                // 首页永远排最前
            return a.name.localeCompare(b.name, 'zh');
        });
        return list;
    }

    /* ---------------- 来源一：GitHub API ---------------- */

    function githubTarget() {
        if (WIKI.repo && WIKI.repo.indexOf('/') > 0) return { repo: WIKI.repo, dir: '' };
        var m = /^([^.]+)\.github\.io$/i.exec(location.hostname);
        if (!m) return null;                              // 自定义域名要显式配 WIKI.repo
        var owner = m[1];
        var segs = location.pathname.split('/').filter(Boolean);
        var last = segs[segs.length - 1] || '';
        var dirs = /\.html?$/i.test(last) ? segs.slice(0, -1) : segs;
        return { repo: owner + '/' + (dirs.length ? dirs[0] : owner + '.github.io'), dir: dirs.slice(1).join('/') };
    }

    function joinPath(dir, name) {
        return dir ? dir + '/' + name : name;
    }

    function apiContents(repo, dir) {
        var url = 'https://api.github.com/repos/' + repo + '/contents/' + dir;
        return fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
            .then(function (res) { return res.ok ? res.json() : null; })
            .catch(function () { return null; });          // 断网 / 限流都当没有
    }

    function htmlEntries(arr, dir) {
        if (!Array.isArray(arr)) return [];
        return arr.filter(function (it) {
            return it && it.type === 'file' && /\.html?$/i.test(it.name || '') &&
                !/^[._]/.test(it.name) && !/^404\.html?$/i.test(it.name);
        }).map(function (it) { return { path: joinPath(dir, it.name) }; });
    }

    function listFromGitHub() {
        var target = githubTarget();
        if (!target || location.protocol === 'file:') return Promise.resolve([]);
        try {
            var c = JSON.parse(localStorage.getItem(GH_KEY) || 'null');
            if (c && c.repo === target.repo && c.dir === target.dir && Date.now() - c.ts < WIKI.cacheHours * 3600000) {
                return Promise.resolve(c.files || []);
            }
        } catch (e) { /* 缓存坏了就直接请求 */ }

        return apiContents(target.repo, target.dir).then(function (root) {
            if (!Array.isArray(root)) return [];

            // 1) 根目录下的 *.html
            var out = htmlEntries(root, target.dir);

            // 2) pages/ 下的子目录：每个目录取它的 index.html，同时收下直接的 .html
            var subs = root.filter(function (it) {
                return it && it.type === 'dir' && it.name === WIKI.pagesDir && !/^[._]/.test(it.name);
            }).map(function (it) { return joinPath(target.dir, it.name); });

            return Promise.all(subs.map(function (dir) {
                return apiContents(target.repo, dir).then(function (children) {
                    if (!Array.isArray(children)) return [];
                    var list = htmlEntries(children, dir);
                    children.forEach(function (it) {
                        if (it && it.type === 'dir' && it.name && !/^[._]/.test(it.name)) {
                            list.push({ path: joinPath(joinPath(dir, it.name), 'index.html') });
                        }
                    });
                    return list;
                });
            })).then(function (nested) {
                nested.forEach(function (l) { out = out.concat(l); });
                try {
                    localStorage.setItem(GH_KEY, JSON.stringify({ repo: target.repo, dir: target.dir, ts: Date.now(), files: out }));
                } catch (e) { /* 忽略 */ }
                return out;
            });
        });
    }

    /* ---------------- 来源二：pages.json（可选） ---------------- */

    function listFromManifest() {
        if (!WIKI.manifest) return Promise.resolve([]);
        return fetch(WIKI.manifest, { cache: 'no-cache' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data) return [];
                var arr = Array.isArray(data) ? data : (Array.isArray(data.pages) ? data.pages : []);
                return arr.map(function (it) {
                    if (typeof it === 'string') return { path: it };
                    if (it && typeof it === 'object') {
                        return {
                            path: it.path || it.file || it.href,
                            name: it.name,
                            descript: it.descript || it.description || it.desc,
                            group: it.group
                        };
                    }
                    return null;
                }).filter(Boolean);
            })
            .catch(function () { return []; });
    }

    /* ---------------- 顺带抓取各页面的 head JSON ---------------- */

    function probePages(list) {
        var me = pagePath().toLowerCase();
        var todo = list.filter(function (p) {
            return !p.descript && p.path.toLowerCase() !== me;
        }).slice(0, WIKI.probeLimit);
        if (!todo.length) return Promise.resolve();

        return Promise.all(todo.map(function (p) {
            return fetch(encodeURI(p.path), { cache: 'force-cache' })
                .then(function (res) { return res.ok ? res.text() : ''; })
                .then(function (html) {
                    if (!html) return;
                    var m = readMetaFrom(new DOMParser().parseFromString(html, 'text/html'));
                    if (m.name) p.name = m.name;
                    if (m.descript) p.descript = m.descript;
                    if (m.group) p.group = m.group;
                })
                .catch(function () { /* file:// 下 fetch 会被拦，忽略即可 */ });
        }));
    }

    /* ---------------- 汇总 ---------------- */

    var pages = [];      // 当前已知的全部页面

    function localPages() {
        return collect([registryList(), [selfEntry()]]);
    }

    function discover() {
        // 先用本地已知的画出来，侧栏立刻可用
        pages = localPages();
        render();

        // 再去联网补充，回来后再画一次
        return Promise.all([listFromGitHub(), listFromManifest()]).then(function (res) {
            var merged = collect([res[0], res[1], registryList(), [selfEntry()]]);
            return probePages(merged).then(function () {
                rememberPages(merged);
                // 以内存里的 merged 为准重建：localStorage 不可用（隐私模式 / file://）时也不会丢结果
                pages = collect([merged, [selfEntry()]]);
                render();
            });
        });
    }

    /* ------------------------------ 样式 ------------------------------ */

    function injectStyles() {
        if (styleDone || document.getElementById('dsh-ui-style')) return;
        styleDone = true;

        var css = [
            ':root{',
            '  --dsh-bg:#ffffff; --dsh-fg:#1b1b1b; --dsh-fg-soft:#4a4a4a; --dsh-muted:#8a8a8a;',
            '  --dsh-line:#ececec; --dsh-line-strong:#dcdcdc; --dsh-hover:#f4f4f5; --dsh-code-bg:#f3f4f6;',
            '  --dsh-accent:#4d6bfe; --dsh-accent-soft:rgba(77,107,254,.10);',
            '  --dsh-side-bg:#1b1b1b; --dsh-side-fg:#dcdcdc; --dsh-side-muted:#8f8f8f;',
            '  --dsh-side-hover:#282828; --dsh-side-active:#333333; --dsh-side-line:#2e2e2e;',
            '  --dsh-shadow:0 6px 24px rgba(0,0,0,.10);',
            '  --dsh-side-w:248px; --dsh-rail-w:264px;',
            '}',
            'html[data-theme="dark"]{',
            '  --dsh-bg:#1c1c1c; --dsh-fg:#e8e8e8; --dsh-fg-soft:#c3c3c3; --dsh-muted:#8f8f8f;',
            '  --dsh-line:#303030; --dsh-line-strong:#3d3d3d; --dsh-hover:#262626; --dsh-code-bg:#272727;',
            '  --dsh-accent:#7b90ff; --dsh-accent-soft:rgba(123,144,255,.14);',
            '  --dsh-side-bg:#141414; --dsh-side-hover:#242424; --dsh-side-active:#2f2f2f; --dsh-side-line:#282828;',
            '  --dsh-shadow:0 8px 28px rgba(0,0,0,.45);',
            '}',

            'html,body{height:100%;margin:0;}',
            'body{',
            '  background:var(--dsh-bg); color:var(--dsh-fg); overflow:hidden;',
            '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;',
            '  font-size:15px; line-height:1.75; -webkit-font-smoothing:antialiased;',
            '}',
            '.dsh-app{display:flex; height:100%; overflow:hidden;}',

            /* ---------- 左侧栏 ---------- */
            '.dsh-side{',
            '  flex:none; width:var(--dsh-side-w); min-height:0; display:flex; flex-direction:column;',
            '  background:var(--dsh-side-bg); color:var(--dsh-side-fg); transition:margin-left .18s ease;',
            '}',
            '.dsh-app.is-side-collapsed .dsh-side{margin-left:calc(var(--dsh-side-w) * -1);}',
            '.dsh-side-head{flex:none; display:flex; align-items:center; gap:6px; padding:10px 8px 6px 12px;}',
            '.dsh-brand{flex:1; min-width:0; display:flex; align-items:center; gap:8px;}',
            '.dsh-brand-mark{flex:none; width:22px; height:22px; border-radius:6px; background:var(--dsh-accent); color:#fff;',
            '  display:grid; place-items:center; font-size:12px; font-weight:700;}',
            '.dsh-brand-name{font-size:14px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}',
            '.dsh-brand-meta{flex:none; font-size:10px; letter-spacing:.06em; color:var(--dsh-side-muted);',
            '  border:1px solid var(--dsh-side-line); border-radius:4px; padding:0 4px;}',
            '.dsh-side-head-actions{flex:none; display:flex; gap:2px;}',
            '.dsh-icon-btn{display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px;',
            '  border:0; border-radius:7px; background:transparent; color:var(--dsh-side-muted); cursor:pointer; padding:0;',
            '  text-decoration:none; font:inherit;}',
            '.dsh-icon-btn:hover{background:var(--dsh-side-hover); color:#fff;}',
            '.dsh-side-scroll{flex:1 1 auto; min-height:0; overflow-y:auto; padding:6px 8px 10px;}',
            '.dsh-pill{display:flex; align-items:center; justify-content:center; gap:7px; width:100%; height:34px;',
            '  margin:2px 0 10px; border:0; border-radius:9px; background:#2b2b2b; color:#eaeaea; cursor:pointer;',
            '  font-family:inherit; font-size:13px;}',
            '.dsh-pill:hover{background:#343434;}',
            '.dsh-sec{margin-top:6px;}',
            '.dsh-sec-head{display:flex; align-items:center; gap:2px; padding:4px 2px 4px 8px; color:var(--dsh-side-muted); font-size:12px;}',
            '.dsh-sec-title{flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}',
            '.dsh-sec-actions{flex:none; display:flex; gap:1px;}',
            '.dsh-filter{padding:2px 6px 6px;}',
            '.dsh-filter input{width:100%; box-sizing:border-box; background:#232323; color:#eee; font-family:inherit;',
            '  font-size:12.5px; padding:5px 8px; border:1px solid var(--dsh-side-line); border-radius:8px;}',
            '.dsh-filter input:focus{outline:none; border-color:var(--dsh-accent);}',
            '.dsh-nav{display:flex; flex-direction:column; gap:1px;}',
            '.dsh-nav-item{display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:8px;',
            '  color:var(--dsh-side-fg); text-decoration:none; font-size:13.5px; line-height:1.5;}',
            '.dsh-nav-item:hover{background:var(--dsh-side-hover); color:#fff;}',
            '.dsh-nav-item.is-active{background:var(--dsh-side-active); color:#fff;}',
            '.dsh-nav-item[hidden]{display:none;}',
            '.dsh-nav-icon{flex:none; display:inline-flex; color:var(--dsh-side-muted);}',
            '.dsh-nav-item.is-active .dsh-nav-icon{color:#fff;}',
            '.dsh-nav-label{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}',
            '.dsh-nav-note{flex:none; font-size:11px; color:var(--dsh-side-muted);}',
            '.dsh-nav-sub{padding-left:24px;}',
            '.dsh-side-foot{flex:none; border-top:1px solid var(--dsh-side-line); padding:6px 8px;}',
            '.dsh-foot-item{display:flex; align-items:center; gap:8px; width:100%; padding:6px 8px; border:0; border-radius:8px;',
            '  background:transparent; color:var(--dsh-side-fg); cursor:pointer; font-family:inherit; font-size:13px; text-align:left;}',
            '.dsh-foot-item:hover{background:var(--dsh-side-hover); color:#fff;}',

            /* ---------- 中间主区 ---------- */
            '.dsh-main{flex:1 1 auto; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--dsh-bg);}',
            '.dsh-topbar{flex:none; display:flex; align-items:center; gap:10px; height:48px; padding:0 18px;',
            '  border-bottom:1px solid var(--dsh-line);}',
            '.dsh-page-title{margin:0; font-size:15px; font-weight:600; color:var(--dsh-fg); min-width:0;',
            '  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}',
            '.dsh-badge{flex:none; font-size:11.5px; color:var(--dsh-muted); border:1px solid var(--dsh-line-strong);',
            '  border-radius:6px; padding:0 7px; line-height:1.7;}',
            '.dsh-icon-btn-main{display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px;',
            '  flex:none; border:0; border-radius:8px; background:transparent; color:var(--dsh-muted); cursor:pointer; padding:0;}',
            '.dsh-icon-btn-main:hover{background:var(--dsh-hover); color:var(--dsh-fg);}',
            '.dsh-menu-btn{display:none;}',
            '.dsh-app.is-side-collapsed .dsh-menu-btn{display:inline-flex;}',
            '.dsh-content{flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; scroll-behavior:smooth;}',
            '.dsh-article{max-width:780px; margin:0 auto; padding:22px 32px 40px; overflow-wrap:break-word;}',
            '.dsh-page-meta{margin:0 0 20px; font-size:12px; color:var(--dsh-muted);}',

            /* ---------- 正文排版 ---------- */
            '.dsh-article h1{font-size:24px; margin:8px 0 14px; font-weight:700;}',
            '.dsh-article h2{font-size:19px; margin:30px 0 10px; font-weight:650;}',
            '.dsh-article h3{font-size:16px; margin:22px 0 8px; font-weight:650;}',
            '.dsh-article p{margin:10px 0;}',
            '.dsh-article a{color:var(--dsh-accent); text-decoration:none;}',
            '.dsh-article a:hover{text-decoration:underline;}',
            '.dsh-article ul,.dsh-article ol{margin:10px 0; padding-left:22px;}',
            '.dsh-article li{margin:4px 0;}',
            '.dsh-article code{background:var(--dsh-code-bg); border-radius:4px; padding:1px 5px; font-size:13px;',
            '  overflow-wrap:anywhere;',
            '  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}',
            '.dsh-article pre{background:var(--dsh-code-bg); border:1px solid var(--dsh-line); border-radius:10px;',
            '  padding:12px 14px; overflow:auto;}',
            '.dsh-article pre code{background:none; padding:0; font-size:12.5px;}',
            '.dsh-article blockquote{margin:12px 0; padding:2px 0 2px 14px; border-left:3px solid var(--dsh-line-strong);',
            '  color:var(--dsh-fg-soft);}',
            '.dsh-article hr{border:0; border-top:1px solid var(--dsh-line); margin:24px 0;}',
            '.dsh-article img{max-width:100%; height:auto; border-radius:8px;}',
            '.dsh-article table{border-collapse:collapse; width:100%; margin:12px 0; font-size:13.5px;}',
            '.dsh-article th,.dsh-article td{border:1px solid var(--dsh-line-strong); padding:6px 10px; text-align:left;}',
            '.dsh-article th{background:var(--dsh-hover);}',
            '.dsh-article button{font-family:inherit; font-size:13.5px; padding:6px 14px; cursor:pointer;',
            '  border:1px solid var(--dsh-line-strong); border-radius:9px; background:var(--dsh-bg); color:var(--dsh-fg);}',
            '.dsh-article button:hover{border-color:var(--dsh-accent); color:var(--dsh-accent);}',

            /* ---------- 索引卡片（对应截图里的文件卡片） ---------- */
            '.dsh-cards{display:flex; flex-direction:column; gap:10px; margin:14px 0;}',
            '.dsh-card{display:flex; align-items:center; gap:12px; padding:11px 13px; text-decoration:none; color:inherit;',
            '  border:1px solid var(--dsh-line); border-radius:12px; background:var(--dsh-bg);',
            '  transition:border-color .15s ease, box-shadow .15s ease;}',
            '.dsh-card:hover{border-color:var(--dsh-line-strong); box-shadow:var(--dsh-shadow);}',
            '.dsh-card-icon{flex:none; width:32px; height:32px; border-radius:9px; background:var(--dsh-hover);',
            '  display:grid; place-items:center; color:var(--dsh-fg-soft);}',
            '.dsh-card-body{flex:1; min-width:0;}',
            '.dsh-card-title{display:block; font-size:14px; font-weight:600; color:var(--dsh-fg);}',
            '.dsh-card-desc{display:block; font-size:12.5px; color:var(--dsh-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}',
            '.dsh-card-open{flex:none; font-size:12.5px; padding:3px 12px; border-radius:8px;',
            '  border:1px solid var(--dsh-line-strong); color:var(--dsh-fg-soft);}',
            '.dsh-card:hover .dsh-card-open{border-color:var(--dsh-accent); color:var(--dsh-accent);}',

            /* ---------- 底部输入条 ---------- */
            '.dsh-composer-wrap{position:relative; flex:none; padding:6px 24px 14px;}',
            '.dsh-composer{border:1px solid var(--dsh-line-strong); border-radius:14px; background:var(--dsh-bg);',
            '  padding:9px 11px 7px; transition:border-color .15s ease, box-shadow .15s ease;}',
            '.dsh-composer:focus-within{border-color:var(--dsh-accent); box-shadow:0 0 0 3px var(--dsh-accent-soft);}',
            '.dsh-input{display:block; width:100%; box-sizing:border-box; min-height:42px; max-height:132px; padding:0;',
            '  border:0; outline:none; resize:none; background:transparent; color:var(--dsh-fg);',
            '  font-family:inherit; font-size:14px; line-height:1.6;}',
            '.dsh-input::placeholder{color:var(--dsh-muted);}',
            '.dsh-composer-bar{display:flex; align-items:center; gap:8px; margin-top:6px;}',
            '.dsh-chip{display:inline-flex; align-items:center; gap:6px; max-width:60%; overflow:hidden;',
            '  font-size:12px; color:var(--dsh-muted); border:1px solid var(--dsh-line); border-radius:8px; padding:2px 8px;',
            '  white-space:nowrap; text-overflow:ellipsis;}',
            '.dsh-send{flex:none; margin-left:auto; width:30px; height:30px; border:0; border-radius:50%; cursor:pointer;',
            '  background:var(--dsh-accent); color:#fff; display:grid; place-items:center; padding:0;}',
            '.dsh-send:hover{filter:brightness(1.08);}',
            '.dsh-results{position:absolute; left:24px; right:24px; bottom:calc(100% - 4px); z-index:20; padding:5px;',
            '  background:var(--dsh-bg); border:1px solid var(--dsh-line-strong); border-radius:12px;',
            '  box-shadow:var(--dsh-shadow); max-height:290px; overflow:auto;}',
            '.dsh-results[hidden]{display:none;}',
            '.dsh-result{display:flex; align-items:center; gap:10px; padding:7px 9px; border-radius:8px;',
            '  text-decoration:none; color:inherit; font-size:13.5px;}',
            '.dsh-result:hover,.dsh-result.is-sel{background:var(--dsh-hover);}',
            '.dsh-result-body{flex:1; min-width:0;}',
            '.dsh-result-desc{display:block; font-size:12px; color:var(--dsh-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}',
            '.dsh-result-sec{flex:none; font-size:11.5px; color:var(--dsh-muted);}',
            '.dsh-empty{padding:10px; font-size:13px; color:var(--dsh-muted);}',

            /* ---------- 右侧目录栏 ---------- */
            '.dsh-rail{flex:none; width:var(--dsh-rail-w); min-height:0; display:flex; flex-direction:column;',
            '  border-left:1px solid var(--dsh-line); background:var(--dsh-bg);}',
            '.dsh-rail-tabs{flex:none; display:flex; gap:16px; padding:0 16px; border-bottom:1px solid var(--dsh-line);}',
            '.dsh-rail-tab{border:0; background:transparent; padding:13px 0 11px; margin-bottom:-1px; cursor:pointer;',
            '  font-family:inherit; font-size:13px; color:var(--dsh-muted); border-bottom:2px solid transparent;}',
            '.dsh-rail-tab.is-active{color:var(--dsh-fg); font-weight:600; border-bottom-color:var(--dsh-accent);}',
            '.dsh-rail-body{flex:1 1 auto; min-height:0; overflow-y:auto; padding:10px 12px;}',
            '.dsh-toc-item{display:block; padding:4px 8px; border-radius:7px; border-left:2px solid transparent;',
            '  font-size:13px; color:var(--dsh-fg-soft); text-decoration:none; overflow:hidden;',
            '  text-overflow:ellipsis; white-space:nowrap;}',
            '.dsh-toc-item:hover{background:var(--dsh-hover);}',
            '.dsh-toc-item.is-active{color:var(--dsh-accent); background:var(--dsh-accent-soft); border-left-color:var(--dsh-accent);}',
            '.dsh-toc-h3{padding-left:20px; font-size:12.5px;}',
            '.dsh-info{font-size:12.5px; color:var(--dsh-fg-soft);}',
            '.dsh-info-row{display:flex; gap:10px; padding:5px 0; border-bottom:1px dashed var(--dsh-line);}',
            '.dsh-info-key{flex:none; width:70px; color:var(--dsh-muted);}',
            '.dsh-info-val{flex:1; min-width:0; word-break:break-all;}',
            '.dsh-rail-hint{font-size:12.5px; color:var(--dsh-muted);}',

            /* ---------- 滚动条 ---------- */
            '.dsh-content,.dsh-side-scroll,.dsh-rail-body,.dsh-results{scrollbar-width:thin;}',
            '.dsh-content::-webkit-scrollbar,.dsh-side-scroll::-webkit-scrollbar,',
            '.dsh-rail-body::-webkit-scrollbar,.dsh-results::-webkit-scrollbar{width:8px; height:8px;}',
            '.dsh-content::-webkit-scrollbar-track,.dsh-side-scroll::-webkit-scrollbar-track,',
            '.dsh-rail-body::-webkit-scrollbar-track{background:transparent;}',
            '.dsh-content::-webkit-scrollbar-thumb,.dsh-rail-body::-webkit-scrollbar-thumb,',
            '.dsh-results::-webkit-scrollbar-thumb{background:var(--dsh-line-strong); border-radius:4px;}',
            '.dsh-side-scroll::-webkit-scrollbar-thumb{background:#3a3a3a; border-radius:4px;}',

            /* ---------- 遮罩与响应式 ---------- */
            '.dsh-scrim{display:none; position:fixed; top:0; right:0; bottom:0; left:0; z-index:55; background:rgba(0,0,0,.45);}',
            '@media (max-width:1180px){ .dsh-rail{display:none;} }',
            '@media (max-width:900px){',
            '  .dsh-side{position:fixed; top:0; bottom:0; left:0; z-index:60; transform:translateX(-100%);',
            '    transition:transform .2s ease;}',
            '  .dsh-app.is-side-open .dsh-side{transform:none; box-shadow:0 0 40px rgba(0,0,0,.45);}',
            '  .dsh-app.is-side-collapsed .dsh-side{margin-left:0;}',
            '  .dsh-app.is-side-open .dsh-scrim{display:block;}',
            '  .dsh-menu-btn{display:inline-flex;}',
            '  .dsh-topbar{padding:0 12px;}',
            '  .dsh-article{padding:18px 16px 32px;}',
            '  .dsh-composer-wrap{padding:6px 12px 12px;}',
            '  .dsh-results{left:12px; right:12px;}',
            '}',
            '@media print{',
            '  .dsh-side,.dsh-rail,.dsh-topbar,.dsh-composer-wrap,.dsh-scrim{display:none !important;}',
            '  html,body{height:auto; overflow:visible;}',
            '  .dsh-app,.dsh-main,.dsh-content{display:block; height:auto; overflow:visible;}',
            '}'
        ].join('\n');

        document.head.appendChild(el('style', { id: 'dsh-ui-style', text: css }));
    }

    /* ------------------------------ 界面构建 ------------------------------ */

    var refs = {};

    function buildSidebar() {
        var side = el('aside', { class: 'dsh-side', id: 'dsh-side' });

        var head = el('div', { class: 'dsh-side-head' }, [
            el('div', { class: 'dsh-brand' }, [
                el('span', { class: 'dsh-brand-mark', text: (WIKI.brand || 'W').charAt(0).toUpperCase() }),
                el('span', { class: 'dsh-brand-name', text: WIKI.brand }),
                el('span', { class: 'dsh-brand-meta', text: WIKI.meta })
            ]),
            el('div', { class: 'dsh-side-head-actions' }, [
                iconBtn('dsh-icon-btn', 'collapse', '收起侧栏', ICONS.panel),
                el('a', { class: 'dsh-icon-btn', href: WIKI.home, title: '回到首页', 'aria-label': '回到首页', html: ICONS.home })
            ])
        ]);

        var searchPill = el('button', { type: 'button', class: 'dsh-pill', dataset: { act: 'focus-search' } }, [
            el('span', { class: 'dsh-nav-icon', html: ICONS.search }),
            el('span', { text: '搜索页面' })
        ]);

        var navHost = el('div', { class: 'dsh-nav-host' });
        var scroll = el('div', { class: 'dsh-side-scroll' }, [searchPill, navHost]);
        refs.navHost = navHost;

        var themeNote = el('span', { class: 'dsh-nav-note', text: '' });
        var themeBtn = el('button', { type: 'button', class: 'dsh-foot-item', dataset: { act: 'theme' } }, [
            el('span', { class: 'dsh-nav-icon', html: ICONS.gear }),
            el('span', { class: 'dsh-nav-label', text: '设置' }),
            themeNote
        ]);
        var foot = el('div', { class: 'dsh-side-foot' }, [themeBtn]);

        side.appendChild(head);
        side.appendChild(scroll);
        side.appendChild(foot);
        refs.themeNote = themeNote;
        return side;
    }

    function navItem(p) {
        var isHome = p.path.toLowerCase() === String(WIKI.home || '').toLowerCase();
        var a = el('a', {
            class: 'dsh-nav-item',
            href: hrefFor(p.path),
            title: p.descript ? p.name + ' —— ' + p.descript : p.name
        }, [
            el('span', { class: 'dsh-nav-icon', html: isHome ? ICONS.home : ICONS.doc }),
            el('span', { class: 'dsh-nav-label', text: p.name })
        ]);
        if (isCurrent(p.path)) {
            a.classList.add('is-active');
            a.setAttribute('aria-current', 'page');
        }
        return a;
    }

    // 侧栏列表按 group 分组渲染，发现到新页面时整体重画
    function renderNav() {
        var host = refs.navHost;
        if (!host) return;
        host.textContent = '';

        var groups = [], byGroup = {};
        pages.forEach(function (p) {
            var g = p.group || WIKI.defaultGroup;
            if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
            byGroup[g].push(p);
        });

        groups.forEach(function (title) {
            var nav = el('nav', { class: 'dsh-nav', 'aria-label': title + '列表' });
            var filterInput = el('input', {
                type: 'search', placeholder: '筛选「' + title + '」…',
                'aria-label': '筛选' + title
            });
            var filterWrap = el('div', { class: 'dsh-filter', hidden: true }, [filterInput]);
            var items = [];

            byGroup[title].forEach(function (p) {
                var link = navItem(p);
                nav.appendChild(link);
                items.push({ node: link, text: (p.name + ' ' + p.descript + ' ' + p.path).toLowerCase() });
            });

            filterInput.addEventListener('input', function () {
                var q = filterInput.value.trim().toLowerCase();
                items.forEach(function (it) { it.node.hidden = !!q && it.text.indexOf(q) === -1; });
            });
            filterInput.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    filterInput.value = '';
                    filterInput.dispatchEvent(new Event('input'));
                    filterWrap.hidden = true;
                }
            });

            var secHead = el('div', { class: 'dsh-sec-head' }, [
                el('span', { class: 'dsh-sec-title', text: title }),
                el('div', { class: 'dsh-sec-actions' }, [
                    iconBtn('dsh-icon-btn', 'filter', '筛选', ICONS.search),
                    iconBtn('dsh-icon-btn', 'top', '回到顶部', ICONS.up)
                ])
            ]);

            var secEl = el('div', { class: 'dsh-sec' }, [secHead, filterWrap, nav]);
            secEl.querySelector('[data-act="filter"]').addEventListener('click', function () {
                filterWrap.hidden = !filterWrap.hidden;
                if (!filterWrap.hidden) filterInput.focus();
            });
            secEl.querySelector('[data-act="top"]').addEventListener('click', function () {
                if (refs.content) refs.content.scrollTo({ top: 0, behavior: 'smooth' });
            });
            host.appendChild(secEl);
        });
    }

    // 页面清单变化后，把依赖它的部分重画一遍
    function render() {
        renderNav();
        renderIndex();
        if (!refs.results.hidden) runSearch(refs.input.value);
        if (refs.tabInfo.classList.contains('is-active')) renderInfo();
    }

    function buildMain() {
        var menuBtn = iconBtn('dsh-icon-btn-main dsh-menu-btn', 'menu', '展开侧栏', ICONS.panel);
        var title = el('h1', { class: 'dsh-page-title', id: 'dsh-title' });
        var topbar = el('header', { class: 'dsh-topbar' }, [
            menuBtn,
            title,
            el('span', { class: 'dsh-badge', text: WIKI.pageBadge })
        ]);

        var article = el('article', { class: 'dsh-article', id: 'dsh-article' });
        var content = el('div', { class: 'dsh-content', id: 'dsh-content' }, [article]);

        var input = el('textarea', {
            class: 'dsh-input', id: 'dsh-input', rows: '1',
            placeholder: WIKI.searchPlaceholder, 'aria-label': '站内搜索'
        });
        var chip = el('span', { class: 'dsh-chip' }, [
            el('span', { class: 'dsh-nav-icon', html: ICONS.doc }),
            el('span', { text: pagePath() })
        ]);
        var sendBtn = el('button', { type: 'button', class: 'dsh-send', title: '打开第一个结果', 'aria-label': '搜索', html: ICONS.up });
        var results = el('div', { class: 'dsh-results', hidden: true, role: 'listbox', 'aria-label': '搜索结果' });
        var composer = el('div', { class: 'dsh-composer' }, [input, el('div', { class: 'dsh-composer-bar' }, [chip, sendBtn])]);
        var wrap = el('div', { class: 'dsh-composer-wrap' }, [results, composer]);

        var main = el('main', { class: 'dsh-main', id: 'dsh-main' }, [topbar, content, wrap]);

        refs.title = title;
        refs.article = article;
        refs.content = content;
        refs.input = input;
        refs.results = results;
        refs.sendBtn = sendBtn;
        refs.menuBtn = menuBtn;
        return main;
    }

    function buildRail() {
        var tabToc = el('button', { type: 'button', class: 'dsh-rail-tab is-active', role: 'tab', 'aria-selected': 'true', text: '目录' });
        var tabInfo = el('button', { type: 'button', class: 'dsh-rail-tab', role: 'tab', 'aria-selected': 'false', text: '信息' });
        var body = el('div', { class: 'dsh-rail-body', id: 'dsh-rail-body', role: 'tabpanel' });
        var rail = el('aside', { class: 'dsh-rail', id: 'dsh-rail' }, [
            el('div', { class: 'dsh-rail-tabs', role: 'tablist' }, [tabToc, tabInfo]),
            body
        ]);
        refs.tabToc = tabToc;
        refs.tabInfo = tabInfo;
        refs.railBody = body;
        return rail;
    }

    /* ------------------------------ 正文搬运 ------------------------------ */

    function takePageNodes() {
        return Array.prototype.slice.call(document.body.childNodes).filter(function (n) {
            if (n.nodeType === 3) return n.textContent.trim() !== '';
            if (n.nodeType !== 1) return false;
            var tag = n.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'NOSCRIPT') return false;
            if (n.id === 'dsh-app') return false;
            return true;
        });
    }

    function titleFromDocument() {
        var t = document.title || '未命名页面';
        return t.split(/\s+[-|–—]\s+/)[0].trim();
    }

    /* ------------------------------ 内容增强 ------------------------------ */

    function renderMeta() {
        var text = (refs.article.innerText || refs.article.textContent || '').replace(/\s+/g, '');
        var chars = text.length;
        var minutes = Math.max(1, Math.round(chars / 400));
        refs.article.insertBefore(
            el('p', { class: 'dsh-page-meta', text: '共 ' + chars + ' 字 · 约 ' + minutes + ' 分钟读完' }),
            refs.article.firstChild
        );
    }

    function renderIndex() {
        var holder = refs.article.querySelector('[data-wiki-index]');
        if (!holder) return;
        holder.textContent = '';

        var cards = el('div', { class: 'dsh-cards' });
        pages.forEach(function (p) {
            cards.appendChild(el('a', { class: 'dsh-card', href: hrefFor(p.path) }, [
                el('span', { class: 'dsh-card-icon', html: ICONS.doc }),
                el('span', { class: 'dsh-card-body' }, [
                    el('span', { class: 'dsh-card-title', text: p.name }),
                    el('span', { class: 'dsh-card-desc', text: p.descript || p.path })
                ]),
                el('span', { class: 'dsh-card-open', text: '打开' })
            ]));
        });
        holder.appendChild(cards);

        if (pages.length <= 1) {
            holder.appendChild(el('p', {
                class: 'dsh-rail-hint',
                text: '暂时只发现了本页：部署到 GitHub Pages 后会自动列出仓库里的全部 .html；本地打开时，每访问一个页面就登记一个。'
            }));
        }
    }

    function renderToc() {
        var heads = Array.prototype.slice.call(refs.article.querySelectorAll('h2, h3'));
        var body = refs.railBody;
        body.textContent = '';

        if (!heads.length) {
            body.appendChild(el('div', { class: 'dsh-rail-hint', text: '本页暂无小节。' }));
            return;
        }

        var links = [];
        heads.forEach(function (h, i) {
            if (!h.id) h.id = 'dsh-sec-' + (i + 1);
            var a = el('a', {
                class: 'dsh-toc-item' + (h.tagName === 'H3' ? ' dsh-toc-h3' : ''),
                href: '#' + h.id,
                text: h.textContent.trim()
            });
            a.addEventListener('click', function (e) {
                e.preventDefault();
                h.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTocActive(a);
            });
            links.push({ node: a, head: h });
            body.appendChild(a);
        });

        // 滚动时高亮当前小节：只观察内容区顶部 25% 的范围
        if (window.IntersectionObserver) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    for (var i = 0; i < links.length; i++) {
                        if (links[i].head === entry.target) { setTocActive(links[i].node); break; }
                    }
                });
            }, { root: refs.content, rootMargin: '0px 0px -75% 0px', threshold: 0 });
            heads.forEach(function (h) { io.observe(h); });
        }
    }

    var activeToc = null;
    function setTocActive(node) {
        if (activeToc === node) return;
        if (activeToc) activeToc.classList.remove('is-active');
        activeToc = node;
        activeToc.classList.add('is-active');
    }

    function renderInfo() {
        var text = (refs.article.innerText || refs.article.textContent || '').replace(/\s+/g, '');
        var updated = '';
        try {
            var d = new Date(document.lastModified);
            if (!isNaN(d.getTime())) {
                updated = d.getFullYear() + '-' +
                    String(d.getMonth() + 1).padStart(2, '0') + '-' +
                    String(d.getDate()).padStart(2, '0');
            }
        } catch (e) { updated = ''; }

        var mine = pagePath().toLowerCase();
        var self = null;
        for (var i = 0; i < pages.length; i++) {
            if (pages[i].path.toLowerCase() === mine) { self = pages[i]; break; }
        }
        if (!self) self = selfEntry();

        var rows = [
            ['页面', pagePath()],
            ['名称', self.name],
            ['标题', refs.title.textContent],
            ['字数', text.length + ' 字'],
            ['小节', refs.article.querySelectorAll('h2, h3').length + ' 个'],
            ['更新', updated || '未知'],
            ['主题', document.documentElement.dataset.theme === 'dark' ? '深色' : '浅色']
        ];
        if (self.descript) rows.push(['简介', self.descript]);
        refs.railBody.textContent = '';
        var box = el('div', { class: 'dsh-info' });
        rows.forEach(function (r) {
            box.appendChild(el('div', { class: 'dsh-info-row' }, [
                el('span', { class: 'dsh-info-key', text: r[0] }),
                el('span', { class: 'dsh-info-val', text: r[1] })
            ]));
        });
        refs.railBody.appendChild(box);
    }

    function switchTab(which) {
        var isToc = which === 'toc';
        refs.tabToc.classList.toggle('is-active', isToc);
        refs.tabInfo.classList.toggle('is-active', !isToc);
        refs.tabToc.setAttribute('aria-selected', String(isToc));
        refs.tabInfo.setAttribute('aria-selected', String(!isToc));
        if (isToc) renderToc(); else renderInfo();
    }

    /* ------------------------------ 站内搜索 ------------------------------ */

    var search = { list: [], sel: -1, nodes: [] };

    function runSearch(q) {
        var query = q.trim().toLowerCase();
        search.sel = -1;
        search.nodes = [];

        if (!query) { hideResults(); return; }

        var starts = pages.filter(function (p) {
            return p.name.toLowerCase().indexOf(query) === 0 || p.path.toLowerCase().indexOf(query) === 0;
        });
        var rest = pages.filter(function (p) {
            if (starts.indexOf(p) !== -1) return false;
            return (p.name + ' ' + p.descript + ' ' + p.path + ' ' + (p.group || '')).toLowerCase().indexOf(query) !== -1;
        });
        search.list = starts.concat(rest).slice(0, 8);

        refs.results.textContent = '';
        if (!search.list.length) {
            refs.results.appendChild(el('div', { class: 'dsh-empty', text: '没有匹配的页面。' }));
        } else {
            search.list.forEach(function (p, i) {
                var a = el('a', { class: 'dsh-result', href: hrefFor(p.path), role: 'option' }, [
                    el('span', { class: 'dsh-nav-icon', html: ICONS.doc }),
                    el('span', { class: 'dsh-result-body' }, [
                        el('span', { class: 'dsh-card-title', text: p.name }),
                        el('span', { class: 'dsh-result-desc', text: p.descript || p.path })
                    ]),
                    el('span', { class: 'dsh-result-sec', text: p.group || WIKI.defaultGroup })
                ]);
                a.addEventListener('mouseenter', function () { selectResult(i); });
                search.nodes.push(a);
                refs.results.appendChild(a);
            });
        }
        refs.results.hidden = false;
    }

    function hideResults() {
        refs.results.hidden = true;
        search.sel = -1;
    }

    function selectResult(i) {
        if (!search.nodes.length) return;
        search.sel = (i + search.nodes.length) % search.nodes.length;
        search.nodes.forEach(function (n, idx) { n.classList.toggle('is-sel', idx === search.sel); });
        var picked = search.nodes[search.sel];
        if (picked && picked.scrollIntoView) picked.scrollIntoView({ block: 'nearest' });
    }

    function openResult(i) {
        var target = search.list[i] || search.list[0];
        if (target) location.href = hrefFor(target.path);
    }

    /* ------------------------------ 主题 / 侧栏 ------------------------------ */

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        if (refs.themeNote) refs.themeNote.textContent = theme === 'dark' ? '深色' : '浅色';
        try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 忽略隐私模式报错 */ }
    }

    function toggleTheme() {
        applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    }

    function toggleSidebar() {
        var app = document.getElementById('dsh-app');
        if (window.matchMedia('(max-width: 900px)').matches) {
            app.classList.toggle('is-side-open');
        } else {
            var collapsed = app.classList.toggle('is-side-collapsed');
            try { localStorage.setItem(SIDE_KEY, collapsed ? '1' : '0'); } catch (e) { /* 忽略 */ }
        }
    }

    /* ------------------------------ 启动 ------------------------------ */

    function boot() {
        if (document.getElementById('dsh-app')) return;

        injectStyles();

        var pageNodes = takePageNodes();
        var h1 = null;
        for (var i = 0; i < pageNodes.length; i++) {
            if (pageNodes[i].nodeType === 1 && pageNodes[i].tagName === 'H1') { h1 = pageNodes[i]; break; }
        }
        if (h1) pageNodes.splice(pageNodes.indexOf(h1), 1);

        var app = el('div', { class: 'dsh-app', id: 'dsh-app' }, [
            buildSidebar(),
            buildMain(),
            buildRail(),
            el('div', { class: 'dsh-scrim', id: 'dsh-scrim' })
        ]);

        // 把原页面内容搬进正文区（此时它们已经脱离 body）
        var frag = document.createDocumentFragment();
        pageNodes.forEach(function (n) { frag.appendChild(n); });
        refs.article.appendChild(frag);

        document.body.appendChild(app);

        // 顶栏标题：页面自己的 h1 优先，没有就用 <title>
        if (h1) {
            h1.className = 'dsh-page-title';
            refs.title.parentNode.replaceChild(h1, refs.title);
            refs.title = h1;
        } else {
            refs.title.textContent = titleFromDocument();
        }

        renderMeta();
        renderToc();

        if (document.documentElement.dataset.theme === 'dark') refs.themeNote.textContent = '深色';
        else refs.themeNote.textContent = '浅色';

        // 恢复上次的侧栏折叠状态（仅桌面端）
        try {
            if (localStorage.getItem(SIDE_KEY) === '1' && !window.matchMedia('(max-width: 900px)').matches) {
                app.classList.add('is-side-collapsed');
            }
        } catch (e) { /* 忽略 */ }

        bindEvents(app);

        // 先用本地已知的清单画一遍，再去自动发现更多页面
        discover();
    }

    function bindEvents(app) {
        // 侧栏图标按钮
        app.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('[data-act]') : null;
            if (!btn) return;
            var act = btn.dataset.act;
            if (act === 'collapse' || act === 'menu') toggleSidebar();
            else if (act === 'theme') toggleTheme();
            else if (act === 'focus-search') { e.preventDefault(); refs.input.focus(); }
        });

        // 点击导航后收起移动端侧栏（事件委托，列表重画后依然有效）
        app.addEventListener('click', function (e) {
            var link = e.target.closest ? e.target.closest('.dsh-nav-item') : null;
            if (link && window.matchMedia('(max-width: 900px)').matches) app.classList.remove('is-side-open');
        });

        document.getElementById('dsh-scrim').addEventListener('click', function () {
            app.classList.remove('is-side-open');
        });

        // 右侧栏标签
        refs.tabToc.addEventListener('click', function () { switchTab('toc'); });
        refs.tabInfo.addEventListener('click', function () { switchTab('info'); });

        // 底部搜索
        var input = refs.input;
        input.addEventListener('input', function () {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 132) + 'px';
            runSearch(input.value);
        });
        input.addEventListener('keydown', function (e) {
            var composing = e.isComposing || e.keyCode === 229;   // 中文输入法确认候选词时不要提交
            if (e.key === 'Enter' && !e.shiftKey && !composing) {
                e.preventDefault();
                openResult(search.sel >= 0 ? search.sel : 0);
            } else if (e.key === 'ArrowDown' && search.nodes.length) {
                e.preventDefault(); selectResult(search.sel + 1);
            } else if (e.key === 'ArrowUp' && search.nodes.length) {
                e.preventDefault(); selectResult(search.sel - 1);
            } else if (e.key === 'Escape') {
                hideResults(); input.blur();
            }
        });
        refs.sendBtn.addEventListener('click', function () { openResult(search.sel >= 0 ? search.sel : 0); });

        // 点击别处收起搜索结果
        document.addEventListener('pointerdown', function (e) {
            if (!refs.results.hidden && !e.target.closest('.dsh-composer-wrap')) hideResults();
        });

        // 快捷键：/ 或 Ctrl(+Cmd)+K 聚焦搜索
        document.addEventListener('keydown', function (e) {
            var tag = (e.target.tagName || '').toLowerCase();
            var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
            if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault(); refs.input.focus(); refs.input.select();
            } else if (e.key === '/' && !typing) {
                e.preventDefault(); refs.input.focus();
            } else if (e.key === 'Escape') {
                app.classList.remove('is-side-open');
            }
        });

        // 回到桌面宽度时清掉移动端抽屉状态
        window.addEventListener('resize', function () {
            if (!window.matchMedia('(max-width: 900px)').matches) app.classList.remove('is-side-open');
        });
    }

    /* ------------------------------ 主题预设 ------------------------------ */
    try {
        var saved = localStorage.getItem(THEME_KEY);
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = saved || (prefersDark ? 'dark' : 'light');
    } catch (e) {
        document.documentElement.dataset.theme = 'light';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
