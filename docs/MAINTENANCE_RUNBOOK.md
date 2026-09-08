# 项目审查与维护记录

审查日期：2026-09-05。范围包括 Jekyll 配置、页面与模板、站点自有 JavaScript、Ruby 插件、样式组织、构建脚本和 GitHub Actions。第三方压缩库保持原实现；未修改个人内容数据、页面地址、导航结构或视觉样式。

## 本次优化

- 阅读进度：滚动事件合并到每个动画帧，缓存页面高度；图片加载、折叠区变化和内容高度变化后重新测量；短页面不会产生无效进度值，也不覆盖其他 `load` 监听器。
- 手机目录：合并滚动更新，标题不变时不重复写入 DOM；桌面滚动不更新隐藏的手机目录。目录文字通过文本节点写入，保留标题中的特殊字符。
- 图片回退：某张响应式图片失败时，仅移除该图片所在 `picture` 的 `source`，不影响其他图片，也不依赖 jQuery 加载时机。
- 搜索：动态字段使用 Liquid `jsonify` 生成 JavaScript 字符串，覆盖中文、引号、反斜杠和换行；保留原有导航、社交和主题操作。
- 简历模板：中文备用字段改为方括号访问，消除 Liquid 语法警告。`file_exists` 插件修正 `strip!` 无变化时返回空值的问题。
- GitHub 客户端：独立鉴权请求并发；路径和分支参数编码；保留 HTTP 状态，仅将 404 作为不存在，其余读取错误中止后续写入；损坏的本地配置回退到默认值。
- 发布后台：以标准 YAML 解析替代逐行解析，支持引号、多行文本、数组和嵌套对象。旅行日志保存保留已有条目与额外字段；简历保留顶层额外字段和未由表单管理的章节。连续保存更新 SHA；加载失败时禁止覆盖简历。表单与消息中的文字转义后再写入 HTML。
- 旅行页：保留 `date/location/text/photos.file` 格式，同时支持后台使用的 `date_range/destination/summary/cover_image/photos.url`；复用日期格式化器。
- CSS：由 Sass 单次压缩，关闭生产环境中会破坏 `calc(env(safe-area-inset-bottom, 0px) + 1rem)` 的重复压缩，保持手机目录的安全区定位。
- 构建：排除开发脚本、文档、测试和 Node 依赖；Docker Compose 正确接收 `JEKYLL_ENV`。PowerShell 构建检查 Docker 退出码，清理前校验目标目录且拒绝目录链接，使用原生命令清理，不跨 shell 拼接删除命令。
- 校验：修正结构检查对已删除书单页面的要求，补充后台必要文件。GitHub Actions 在构建前执行结构与逻辑回归检查。

## 数据与依赖约定

`assets/js/cms-data.js` 集中提供 YAML 解析、序列化和文本转义。日期按字符串处理，避免隐式时区转换。保存会重新排版 YAML，不保留注释；未知章节可保留，但表单管理的条目仍以表单字段为准，复杂自定义条目使用原文件编辑入口维护。

后台专用的 `assets/js/lib/js-yaml.min.js` 来自现有 `package-lock.json` 中的 js-yaml 4.1.1，随仓库提交，仅在 `/admin/` 加载；许可证见同目录 `js-yaml.LICENSE`。升级时从已校验版本的 `dist/js-yaml.min.js` 同步文件和许可证，并执行 YAML 往返及后台浏览器测试。[对应版本源码与说明](https://github.com/nodeca/js-yaml/tree/4.1.1)。

站点仍是静态站点：旅行口令的前端访问方式和后台凭证保存方式保持原有设计。外部统计卡片、字体、数学排版等第三方能力保持启用；此次没有通过停用功能缩小页面。

`.github/copilot-instructions.md` 中部分双语与博客说明已过时；现有中文页面和 `scripts/validate_structure.ps1` 是本次核对依据。

## 日常验证

```powershell
./scripts/validate_structure.ps1
npm test
docker compose run --rm --no-deps -e JEKYLL_ENV=production jekyll bundle exec jekyll build
```

`npm test` 使用 Node 自带测试运行器，无需下载测试框架。浏览器检查复用项目已有 Puppeteer 和本机 Chrome/Edge：

```powershell
npm ci --ignore-scripts
npm run test:browser
```

可通过 `CHROME_PATH` 指定浏览器，通过 `SITE_DIR` 指定构建目录，`SITE_BASEURL` 默认 `/MyPage-suihan`（根站点设置为空字符串）。设置 `BASELINE_DIR` 可逐页比对优化前后的正文。测试使用临时本地 HTTP 服务，GitHub 写操作全部拦截为测试响应。

模板专项验证：

```powershell
docker compose run --rm --no-deps jekyll bundle exec ruby tests/jekyll-regression.rb
node --check _site/review-search-fixture.js
```

Windows/Docker 重复写入某些只读产物可能出现 `EACCES`。`scripts/build.ps1` 会在确认 Docker 正常后清理 `_site`；该目录仅用于构建产物，请勿保存手写源文件。需要保留对照产物时可向新的 `_site/review-*` 子目录构建。

## 本次验证记录

- 逻辑回归：21 项通过，涵盖存储配置、中文路径、UTF-8、HTTP 错误、YAML 往返、文本转义、滚动事件合并和动态页面高度。
- 结构检查、严格 Liquid 模板渲染和生成搜索 JavaScript 语法检查通过。
- Docker 生产构建通过，简历模板原有 Liquid 警告已消除。
- Chrome 浏览器回归通过：首页、简历、仓库、项目、旅行、后台六个页面正文与基线一致；搜索、三态主题、图片局部回退、手机目录、动态进度条、旅行口令及照片预览通过。
- 后台模拟回归通过：特殊字符与多行内容正确显示；连续保存使用新 SHA；旅行新增后原条目与额外字段不丢失；403 读取失败不会发送覆盖请求。所有 GitHub 写操作均由本地测试拦截。
- 构建脚本在独立临时目录模拟验证通过：只清理构建目标、生产模式正确传入、结束后恢复调用者环境、Docker 不可用时保留已有产物。
- 本次优化后的生产预览产物位于 `_site/review-verified/`，截图位于 `_site/review-artifacts/`。构建耗时受缓存、图片转换和环境影响，本次不将单次构建时间差解释为稳定性能收益。

## 旅行动态可视化管理（2026-09-06）

- `travel-data.js` 为前台和后台提供统一的动态格式转换与卡片显示；兼容旧标题、日期范围、封面和照片对象。编辑时保留 ID 与额外字段，其余记录及旅行口令保持不变。
- `travel-cms.js` 提供新增、修改、删除、照片预览与排序；上传失败保留当前草稿和已完成的上传，保存前检查文件 SHA，防止覆盖并发修改。删除动态保留图片文件。
- 后台 PAT 改为独立的遮罩文本输入区，认证成功后才保存凭证；旅行口令使用专属表单标识。已有浏览器错误密码记录需在密码管理器中删除一次。
- 浏览器测试中的 GitHub 请求全部模拟，照片上传、修改和删除验证不会修改真实旅行记录。

## Docker 启动套接字异常

本机曾交替出现 `Docker/run/dockerInference` 与 `docker-secrets-engine/engine.sock` 无法访问（1920）的启动错误。仅处理其中一处可能暴露另一处，失败启动还会重新留下套接字。此次在 Docker 引擎未运行时停止失败进程，确认两个目录仅含已知的零字节套接字后，同时重命名为备份目录，再启动 Docker；服务端 29.6.1 和项目生产构建均验证成功。

这是运行时目录的恢复记录，不能保证此类 Windows/Docker 问题永久消失。不要删除 Docker 数据盘、注销 WSL 发行版或使用恢复出厂设置来清理套接字。再次发生时先检查最新日志与进程状态，核对目录内容后再处理；不要将目录内未知内容当作缓存删除。

本轮验证：27 项 Node 测试、结构检查与 JavaScript 语法检查通过；最终生产构建位于 `_site/moments-final/`。真实 `_data/travel.yml` 未修改。

最终 Chrome 回归通过：六个主要页面、旅行口令、动态增删改、照片上传与预览/排序/移除、手机布局、并发冲突和读取失败保护。

## 旅行照片加载优化（2026-09-08）

- 列表优先使用照片对象的 `thumbnail`，点击后打开 `file/src/url` 原图。旧字符串格式仍可使用，缩略图失败会回退原图。
- 解锁后首屏可见照片立即加载，屏幕外照片继续懒加载；锁定时不请求旅行照片。
- 后台上传保留原文件，自动生成长边不超过 800 像素、质量 0.76 的 WebP 缩略图。GIF 保留原来的动画；编码结果比原文件大时直接使用原图。浏览器不支持 WebP 编码时允许 PNG 回退。
- 部分上传失败后保留草稿、固定路径及完成状态，重试时不重复上传已成功的原图。
- 已有本地照片可执行 `node scripts/optimize-travel-images.cjs` 补齐缩略图（需要 Python 和 Pillow；可通过 `PYTHON` 环境变量指定解释器）。脚本保留原图以及照片对象的说明等字段，已有缩略图的条目会跳过。同步远端最新数据后再运行，避免覆盖后台更新。
- 本轮现有 6 张照片总计 1,306,623 字节，列表缩略图为 423,364 字节，减少 67.6%。这表示图片传输体积变化，实际加载耗时还受网络和缓存影响。

验证结果：28 项 Node 测试、结构检查、Docker Jekyll 生产构建以及完整 Chrome 回归均通过。浏览器使用实际 6 张照片验证：手机与桌面各只请求 6 个缩略图，图片响应体合计 423,364 字节，未提前请求原图，页面无横向溢出。模拟后台验证缩略图上传失败后重试不重复上传原图。生产构建输出位于 `_site/travel-optimized/`，发布时由 GitHub Pages 工作流重新执行结构检查、测试和构建。
