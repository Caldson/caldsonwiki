# caldsonwiki

咖咯德苏林的维基——纯静态站点，没有后端也没有构建步骤。

界面（左侧深色导航栏 / 中间正文 / 右侧目录栏 / 底部搜索条）由 `dsh-ui.js` 在每个页面加载时自动注入，
布局参考 DeepSeek Harness 的网页界面。页面本身只写正文，不写 `<style>`。

**页面清单不需要手动维护**，`dsh-ui.js` 会自己发现。

## 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 首页 |
| `about.html` | 关于本站 |
| `oldwebsitemovenotification.html` | 旧站迁移公告 |
| `pages/<名称>/index.html` | 一页一文件夹的页面 |
| `dsh-ui.js` | 唯一的界面脚本：注入样式、侧栏、目录、站内搜索、页面发现 |

根目录的 `*.html` 和 `pages/<名称>/index.html` 都会被收进侧栏，两种结构可以混用。

## 新增一个页面

1. 新建文件夹 `pages/<名称>/`，在里面建 `index.html`，只写正文：
   标题用 `<h1>`，小节用 `<h2>`／`<h3>`（右侧目录会自动生成）。

2. 在 `<head>` 里放一段 JSON 声明这一页：

   ```html
   <script type="application/json" id="page-meta">
   {
       "name": "页面名",
       "descript": "一句话简介",
       "group": "公告"
   }
   </script>
   ```

   | 字段 | 必填 | 说明 |
   | --- | --- | --- |
   | `name` | 否 | 侧栏和索引卡片上显示的名字；不写时：`pages/<文件夹>/index.html` 用**文件夹名**，其余用文件名 |
   | `descript` | 否 | 简介，显示在索引卡片和搜索结果里；不写就显示页面路径 |
   | `group` | 否 | 分栏名，侧栏按它分栏；不写归到 `WIKI.defaultGroup`（默认「页面」） |

3. 在 `</body>` 前保留一行——**子目录里的页面要多两级 `../`**：

   ```html
   <!-- pages/<名称>/index.html 里 -->
   <script src="../../dsh-ui.js"></script>
   ```

保存即可。侧栏、首页索引卡片和站内搜索都会跟着更新。

> 链接是 `dsh-ui.js` 按自己所在目录算出来的，所以不管页面在根目录还是 `pages/<名称>/` 下，
> 侧栏和卡片的链接都能点对，不用手动写相对路径。

## 页面是怎么被发现的

静态站点没法列出自己的目录，所以按三层自动发现，上层拿不到就往下退：

1. **GitHub API**（部署在 `*.github.io` 时）——列出仓库根目录的 `.html`，以及 `pages/` 下每个子目录的
   `index.html`。结果缓存在 localStorage 里 6 小时。
   自定义域名下想让这层生效，把 `WIKI.repo` 填成 `'owner/name'`。
2. **`pages.json`**（可选清单）——仓库里放了这个文件就优先读它：

   ```json
   [
     { "path": "index.html", "name": "首页", "descript": "站点介绍" },
     { "path": "pages/公告/index.html", "name": "公告" },
     "pages/关于/index.html"
   ]
   ```

   只写名字（例如 `"公告"`）会被当成 `pages/公告/index.html`。
3. **localStorage 自注册**——兜底方案：每打开一个页面就把它登记到浏览器本地，侧栏列表越用越全。

> 本地双击用 `file://` 打开时，第 1、2 层都拿不到（`fetch` 被浏览器拦住），只会看到访问过的页面。
> 想看完整列表：部署到 GitHub Pages，或者用本地服务器（例如 `python -m http.server`）配合 `pages.json`。

## 配置

`dsh-ui.js` 顶部的 `WIKI`：

| 项 | 说明 |
| --- | --- |
| `home` | 哪一个页面算首页（排最前、用房子图标）。默认 `index.html`；如果首页是文件夹版，改成 `pages/首页/index.html` |
| `pagesDir` | 一页一文件夹时的目录名，默认 `pages` |
| `defaultGroup` | 页面没写 `group` 时归到哪一栏，默认「页面」 |
| `repo` | `'owner/name'`，自定义域名下让 GitHub API 生效 |
| `manifest` | 可选清单文件名，默认 `pages.json` |

## 说明

- 页面里不要写 `<style>`：样式全部来自 `dsh-ui.js`，改一次就能全站生效。
- 禁用 JavaScript 时页面没有样式，只会显示纯正文。
- 快捷键：`/` 或 `Ctrl`+`K` 聚焦搜索框，`↑` `↓` 选择结果，`Enter` 打开，`Esc` 收起。
- 侧栏底部的「设置」可以切换浅色／深色，选择会记住。
