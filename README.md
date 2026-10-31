# 技能展示（Skill Gallery）

一个 DeepSeek Harness Web 插件：把已安装的技能以卡片形式展示在侧边栏的「技能」页面中。

侧边栏新增「技能」入口，打开后是一页技能卡片。每张卡片展示：

- **本地化显示名**：优先取 `SKILL.md` 的 `metadata.displayName`；没有时通过缓存的 SkillHub 注册表查询中文 `displayName`（只接受含中文的结果，离线时回退到本地 name / slug）；末尾的 `.Skill` 品牌后缀会被去掉，保证标题格式统一；
- 英文名 + slug 作为副标题、绿色「已装」徽章和版本号；
- **固定卡片高度（224px）**，同一行卡片尺寸一致，描述长短不会让卡片跳动；
- 两行描述、文件数、体积与更新时间，数据与磁盘一致；
- 有更新时卡片底部显示「可更新 vX.Y.Z」标记；
- 底部「详情」「卸载」按钮（不可删除的来源不显示卸载）；
- 工具栏的「检查更新」会绕过注册表缓存，重新查询已安装技能的最新版本；详情里同时显示当前版本与最新版本（可更新 / 已是最新）。

**详情弹窗**（注册在 `shell.overlay`，覆盖整帧）：

- 标题、slug、已装徽章、版本与完整描述；
- 文件数 / 总大小 / 更新时间 chips；
- 安装路径、安装来源（存在 `_meta.json` 时显示 SkillHub，否则显示本地 root 类型）、调用方式（模型 / 用户）与发布者（优先注册表 owner 名称，其次 frontmatter 的 `author`，不显示数字 `ownerId`）；
- 支持 X 按钮、遮罩、Esc 关闭；键盘焦点限制在弹窗内，关闭后回到打开它的卡片；
- 弹窗里的「卸载」会先打开确认框，明确显示将被删除的目录，确认后才由 Host 删除并刷新列表。

页面还带搜索框、刷新按钮和「检查更新」；明暗主题只使用 `--dsw-alias-*` 主题 token。

## 技能读取规则

`lib/skills.js` 按优先级**只读**扫描以下根目录：

| 来源 | 路径 |
|---|---|
| `user` | `$DSH_HOME/skills`（默认 `~/.dsh/skills`） |

只展示用户自己安装到该目录的技能；`~/.agents/skills`、项目内技能、DWS 随附技能和 dsh 内置技能都不再进入列表。

技能可以是目录包 `<slug>/SKILL.md`，也可以是扁平的 `<slug>.md`，与文件系统技能提供方的发现规则一致。文件数与体积按包内文件求和，最新的文件修改时间作为更新时间。`_meta.json`（由 SkillHub 写入）提供 slug、版本、数字 owner id 与发布时间。

## 接口

两个接口都经过 Host 的浏览器信任栅栏（`connection.requestRejection`）校验。

- `GET /skill-gallery/skills`：返回扫描到的技能 JSON。通过 SkillHub 安装的技能会做一次可选的、带缓存的 `GET /api/v1/skills/<slug>` 查询（默认 `https://api.skillhub.cn`，可用 `DSH_SKILLHUB_API` 覆盖；设为空可完全离线），用于中文名、发布者与最新版本；`?refresh=1` 跳过这层缓存。
- `POST /skill-gallery/uninstall`：请求体 `{ "id": "<source>:<slug>" }`，只删除当前扫描到的那一个技能。可删除目标仅限扫描到的目录包或扁平 `<name>.md`，解析软链后必须仍是扫描根的直接子项；软链只删链接本身，不删目标。非用户目录提供的技能会标记为不可删除，界面不显示「卸载」，接口也会拒绝。

## 文件

- `index.js` — Host 半：技能列表与卸载接口。
- `lib/skills.js` — 根目录解析、技能发现、frontmatter 解析、文件统计与安全删除。
- `lib/registry.js` — SkillHub 注册表中文名与发布者的可选查询（带缓存）。
- `client.js` — Client 半：卡片页、侧边栏入口、详情/卸载弹窗与本地化词典。
- `locale/en.json`、`locale/zh.json` — 插件展示元数据。
- `icon.svg` — 插件图标。
