/**
 * Client half of the Skill Gallery bundle.
 *
 * Registers one `main` page plus its `sidebar.panellist` icon. The page reads
 * the Host's skill endpoint and renders every installed skill as a card: title,
 * slug, installed badge, version, two-line description, file count and size,
 * update date, and a footer with Details / Uninstall.
 *
 * Details opens a frame-wide dialog with the full description, chips, install
 * path, source, invocation mode, and publisher. Uninstall opens a confirmation
 * dialog and calls the Host's delete endpoint after the user confirms.
 */
window.__ModuleLoader__.load({
  id: '@local/skill-gallery',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    const NS = 'skill-gallery';
    const PANEL_ID = 'skill-gallery';
    const ROUTE = '/skill-gallery/skills';
    const UNINSTALL_ROUTE = '/skill-gallery/uninstall';

    const CSS = [
      '.skg-page{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.6}',
      '.skg-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}',
      '.skg-content{box-sizing:border-box;max-width:1080px;margin:0 auto;padding:28px clamp(20px,4vw,44px) 48px}',
      '.skg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
      '.skg-head h1{margin:0;font-size:20px;font-weight:600;line-height:28px}',
      '.skg-sub{margin:6px 0 0;max-width:62ch;color:var(--dsw-alias-label-secondary);font-size:13px;word-break:keep-all;overflow-wrap:anywhere}',
      '.skg-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:18px 0 16px}',
      '.skg-search{display:flex;align-items:center;flex:1 1 230px;max-width:320px;height:36px;padding:0 10px;gap:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}',
      '.skg-search:focus-within{border-color:var(--dsw-alias-brand-primary)}',
      '.skg-search svg{flex:none}',
      '.skg-search input{flex:1;min-width:0;height:100%;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}',
      '.skg-search input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.skg-spacer{flex:1 1 auto}',
      '.skg-stats{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}',
      '.skg-refresh{display:inline-flex;align-items:center;gap:6px;flex:none;height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}',
      '.skg-refresh:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.skg-refresh:disabled{opacity:.5;cursor:default}',
      '.skg-spin{animation:skg-spin 1s linear infinite}',
      '@keyframes skg-spin{to{transform:rotate(360deg)}}',
      '.skg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;align-items:start}',
      '.skg-grid[data-refreshing="true"]{opacity:.6;transition:opacity .15s ease}',
      '.skg-card{box-sizing:border-box;display:flex;flex-direction:column;min-width:0;height:224px;padding:12px 14px 0;border:1px solid color-mix(in srgb,var(--dsw-alias-state-success-primary) 52%,var(--dsw-alias-border-l1));border-radius:10px;background:var(--dsw-alias-bg-layer-1);transition:border-color .15s ease,box-shadow .15s ease}',
      '.skg-card:hover{border-color:var(--dsw-alias-state-success-primary);box-shadow:0 3px 12px color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}',
      '.skg-card-active{border-color:var(--dsw-alias-brand-primary)}',
      '.skg-card-body{flex:1;min-height:0;padding:2px 0 10px;overflow:hidden}',
            '.skg-card-main{flex:1;min-width:0}',
      '.skg-title-row{display:flex;align-items:center;gap:7px;min-width:0}',
      '.skg-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:600;line-height:22px}',
      '.skg-badge{display:inline-flex;align-items:center;flex:none;margin-left:auto;height:18px;padding:0 7px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);color:var(--dsw-alias-state-success-primary);font-size:11px;line-height:1;white-space:nowrap}',
      '.skg-version{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.skg-slug{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45}',
      '.skg-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:7px 0 0;min-height:39px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}',
      '.skg-meta{display:flex;flex-wrap:wrap;align-items:center;gap:3px 14px;margin-top:9px;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.skg-meta-date{margin-top:3px}',
      '.skg-meta-item{display:inline-flex;align-items:center;gap:5px;min-width:0;white-space:nowrap}',
      '.skg-meta-item svg{flex:none;opacity:.85}',
      '.skg-foot{display:flex;justify-content:flex-end;gap:8px;padding:8px 0 10px;border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.skg-btn{display:inline-flex;align-items:center;justify-content:center;flex:none;height:28px;padding:0 13px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:13px;white-space:nowrap;cursor:pointer}',
      '.skg-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.skg-btn:disabled{opacity:.55;cursor:default}',
      '.skg-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 42%,var(--dsw-alias-border-l2))}',
      '.skg-btn-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}',
      '.skg-msg{display:flex;flex-direction:column;align-items:center;gap:8px;padding:54px 16px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.skg-msg-icon{display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:16px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.skg-msg-title{margin:6px 0 0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500}',
      '.skg-msg-hint{margin:0;max-width:46ch;font-size:12.5px}',
      '.skg-msg .skg-btn{margin-top:8px}',
      '.skg-error .skg-msg-title{color:var(--dsw-alias-state-error-primary)}',
      '.skg-skeleton{display:flex;flex-direction:column;gap:12px;padding:16px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
                        '.skg-sk-line{height:10px;border-radius:6px;background:var(--dsw-alias-bg-layer-2)}',
      '.skg-sk-line.w30{width:30%}',
      '.skg-sk-line.w60{width:60%}',
      '.skg-sk-line.w80{width:80%}',
      '.skg-sk-pulse{animation:skg-pulse 1.4s ease-in-out infinite}',
      '@keyframes skg-pulse{0%,100%{opacity:1}50%{opacity:.55}}',
      '.skg-overlay{position:fixed;inset:0;z-index:80;pointer-events:auto;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 42%,transparent);animation:skg-fade .12s ease}',
      '.skg-dialog{display:flex;flex-direction:column;width:min(760px,100%);max-height:calc(100dvh - 48px);overflow:hidden;border:.5px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 16px 48px color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent);animation:skg-rise .16s ease}',
      '.skg-dialog-sm{width:min(440px,100%)}',
      '.skg-dialog-head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 12px}',
            '.skg-dialog-ident{flex:1;min-width:0}',
      '.skg-dialog-title{margin:0;font-size:18px;font-weight:600;line-height:24px;overflow-wrap:anywhere}',
      '.skg-dialog-slug{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}',
      '.skg-dialog-badges{display:flex;align-items:center;gap:8px;margin-top:6px}',
      '.skg-dialog-badges .skg-badge{margin-left:0}',
      '.skg-dialog-close{display:inline-flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;padding:0;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.skg-dialog-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.skg-dialog-body{flex:1;min-height:0;overflow:auto;padding:0 20px 16px}',
      '.skg-dialog-desc{margin:0 0 14px;font-size:13.5px;line-height:1.75;overflow-wrap:anywhere}',
      '.skg-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}',
      '.skg-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;font-size:12px;line-height:18px;white-space:nowrap}',
      '.skg-chip-label{color:var(--dsw-alias-label-secondary)}',
      '.skg-dialog-rows{display:flex;flex-direction:column;gap:8px;margin:0;padding:12px;border-radius:12px;background:var(--dsw-alias-bg-layer-2)}',
      '.skg-detail{display:grid;grid-template-columns:78px minmax(0,1fr);gap:8px;font-size:12px}',
      '.skg-detail dt{color:var(--dsw-alias-label-secondary)}',
      '.skg-detail dd{min-width:0;margin:0;overflow-wrap:anywhere}',
      '.skg-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5}',
      '.skg-path-cell{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}',
      '.skg-copy-btn{display:inline-flex;align-items:center;justify-content:center;flex:none;height:22px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;line-height:1;white-space:nowrap;cursor:pointer}',
      '.skg-copy-btn:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.skg-dialog-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 12px;padding:12px 20px;border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.skg-dialog-foot .skg-source{max-width:44%}',
      '.skg-dialog-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px}',
      '.skg-source{display:inline-flex;align-items:center;gap:5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.skg-source svg{flex:none}',
      '.skg-confirm-body{padding:0 20px 4px}',
      '.skg-confirm-text{margin:0 0 10px;font-size:13.5px;line-height:1.6;overflow-wrap:anywhere}',
      '.skg-confirm-path{margin:0 0 10px;padding:8px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5;overflow-wrap:anywhere}',
      '.skg-confirm-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.55}',
      '.skg-confirm-error{margin:10px 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5;overflow-wrap:anywhere}',
      '@keyframes skg-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes skg-rise{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}',
      '.skg-page :focus-visible,.skg-dialog :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '@media (prefers-reduced-motion:reduce){.skg-spin,.skg-sk-pulse,.skg-overlay,.skg-dialog{animation:none}}',
    ].join('\n');

    const zh = {
      panel: '技能',
      title: '技能',
      subtitle: '已安装的技能，可查看详情或卸载。',
      refresh: '刷新',
      search: '搜索技能',
      stats: '共 {n} 个技能 · {size}',
      errorTitle: '读取技能列表失败',
      retry: '重试',
      emptyTitle: '还没有已安装的技能',
      emptyHint: '在对话中通过 skillhub 搜索并安装技能后，技能会自动以卡片出现在这里。',
      noResults: '没有匹配的技能',
      noResultsHint: '换一个关键词试试，或清空搜索框。',
      installed: '已装',
      detail: '详情',
      uninstall: '卸载',
      close: '关闭',
      files: '{n} 个文件',
      updated: '更新于 {date}',
      path: '安装路径',
      source: '安装来源',
      version: '版本',
      invocation: '调用方式',
      owner: '发布者',
      copyPath: '复制路径',
      copied: '已复制',
      noDescription: '暂无描述',
      viaSkillhub: 'SkillHub',
      fileCountLabel: '文件数',
      sizeLabel: '总大小',
      updatedLabel: '更新于',
      uninstallTitle: '卸载技能',
      uninstallConfirm: '确定要卸载「{title}」吗？',
      uninstallHint: '将删除该技能目录，此操作不可撤销。需要时可以在 SkillHub 中重新安装。',
      cancel: '取消',
      uninstalling: '正在卸载…',
      uninstallFailed: '卸载失败：{message}',
      sourceUser: '用户技能',
      sourceAgents: '共享技能',
      sourceProject: '项目技能',
      sourceCustom: '自定义目录',
      invBoth: '模型与用户均可调用',
      invModel: '仅模型可调用',
      invUser: '仅用户可调用',
      invNone: '不可直接调用',
    };

    const en = {
      panel: 'Skills',
      title: 'Skills',
      subtitle: 'Installed skills; open Details or Uninstall.',
      refresh: 'Refresh',
      search: 'Search skills',
      stats: '{n} skills · {size}',
      errorTitle: 'Could not load skills',
      retry: 'Retry',
      emptyTitle: 'No skills installed yet',
      emptyHint: 'Search and install a skill with skillhub in the conversation; it will appear here as a card.',
      noResults: 'No matching skills',
      noResultsHint: 'Try another keyword, or clear the search box.',
      installed: 'Installed',
      detail: 'Details',
      uninstall: 'Uninstall',
      close: 'Close',
      files: '{n} files',
      updated: 'Updated {date}',
      path: 'Install path',
      source: 'Install source',
      version: 'Version',
      invocation: 'Invocation',
      owner: 'Publisher',
      copyPath: 'Copy path',
      copied: 'Copied',
      noDescription: 'No description',
      viaSkillhub: 'SkillHub',
      fileCountLabel: 'Files',
      sizeLabel: 'Total size',
      updatedLabel: 'Updated',
      uninstallTitle: 'Uninstall skill',
      uninstallConfirm: 'Uninstall "{title}"?',
      uninstallHint: 'The skill directory will be deleted. This cannot be undone; you can reinstall it from SkillHub later.',
      cancel: 'Cancel',
      uninstalling: 'Uninstalling…',
      uninstallFailed: 'Uninstall failed: {message}',
      sourceUser: 'User skills',
      sourceAgents: 'Shared skills',
      sourceProject: 'Project skills',
      sourceCustom: 'Custom directory',
      invBoth: 'Model and user',
      invModel: 'Model only',
      invUser: 'User only',
      invNone: 'Not directly invocable',
    };

    function svgIcon(size, strokeWidth, children) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        children,
      );
    }

    function FileIcon() {
      return svgIcon(13, 1.4, [
        h('path', { key: 'p', d: 'M9 1.8H4.6a1 1 0 0 0-1 1v10.4a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1V5.2z' }),
        h('path', { key: 'q', d: 'M9 1.8v3.4h3.4' }),
      ]);
    }

    function DiskIcon() {
      return svgIcon(13, 1.4, [
        h('ellipse', { key: 'e', cx: 8, cy: 4, rx: 5.2, ry: 2.2 }),
        h('path', { key: 'p', d: 'M2.8 4v4c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2V4' }),
        h('path', { key: 'q', d: 'M2.8 8v4c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2V8' }),
      ]);
    }

    function ClockIcon() {
      return svgIcon(13, 1.4, [
        h('circle', { key: 'c', cx: 8, cy: 8, r: 6.2 }),
        h('path', { key: 'p', d: 'M8 4.6V8l2.2 1.4' }),
      ]);
    }

    function FolderIcon() {
      return svgIcon(12, 1.4, h('path', { d: 'M1.8 4.2a1 1 0 0 1 1-1h2.7l1.2 1.5h5.5a1 1 0 0 1 1 1v6.1a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z' }));
    }

    function SearchIcon() {
      return svgIcon(14, 1.4, [
        h('circle', { key: 'c', cx: 7, cy: 7, r: 4.5 }),
        h('path', { key: 'p', d: 'M10.4 10.4 14 14' }),
      ]);
    }

    function RefreshIcon() {
      return svgIcon(13, 1.5, [
        h('path', { key: 'a', d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.8' }),
        h('path', { key: 'b', d: 'M13.4 2.6v3.2h-3.2' }),
      ]);
    }

    function CloseIcon() {
      return svgIcon(14, 1.5, [
        h('path', { key: 'a', d: 'M4 4l8 8' }),
        h('path', { key: 'b', d: 'M12 4l-8 8' }),
      ]);
    }

    function GalleryIcon({ size = 36, active = false }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: active ? 1.9 : 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { display: 'block' },
        },
        h('rect', { key: 'a', x: 3, y: 3, width: 7.4, height: 7.4, rx: 2 }),
        h('rect', { key: 'b', x: 13.6, y: 3, width: 7.4, height: 7.4, rx: 2 }),
        h('rect', { key: 'c', x: 3, y: 13.6, width: 7.4, height: 7.4, rx: 2 }),
        h('path', { key: 'd', d: 'M17.3 13.9v6.4M14.1 17.1h6.4' }),
      );
    }

    /** Drop the registry's trailing branding suffix so both cards read the same. */
    function normalizeTitle(value) {
      return value.replace(/\s*[.．]\s*skill\s*$/i, '').trim();
    }

    function displayTitleOf(skill) {
      const candidates = [skill.zhName, skill.registryName, skill.title, skill.name, skill.slug];
      for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const cleaned = normalizeTitle(candidate.trim());
        if (cleaned.length > 0) return cleaned;
      }
      return '?';
    }

    /** Secondary identity: the English name and the install slug. */
    function subtitleOf(skill) {
      const title = displayTitleOf(skill);
      const name = typeof skill.name === 'string' ? skill.name.trim() : '';
      const slug = typeof skill.slug === 'string' ? skill.slug.trim() : '';
      const parts = [];
      if (name.length > 0 && name !== title) parts.push(name);
      if (slug.length > 0 && slug !== title && slug !== name) parts.push(slug);
      return parts.join(' · ');
    }

    /** The directory (bundle) or file (flat skill) the row points at. */
    function locationOf(skill) {
      if (skill.kind === 'file') return skill.path;
      return typeof skill.dir === 'string' && skill.dir.length > 0 ? skill.dir : skill.path;
    }

    function formatBytes(bytes) {
      const value = Number(bytes);
      if (!Number.isFinite(value) || value <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let size = value;
      let unit = 0;
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
      }
      const shown = unit === 0 ? String(Math.round(size)) : size >= 100 ? String(Math.round(size)) : size.toFixed(1);
      return shown + ' ' + units[unit];
    }

    function formatDate(iso, localeId) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return String(iso);
      try {
        return new Intl.DateTimeFormat(localeId === 'zh' ? 'zh-CN' : 'en-US', {
          year: 'numeric',
          month: localeId === 'zh' ? 'long' : 'short',
          day: 'numeric',
        }).format(date);
      } catch {
        return date.toISOString().slice(0, 10);
      }
    }

    function invocationKey(skill) {
      if (skill.modelInvocable && skill.userInvocable) return 'invBoth';
      if (skill.modelInvocable) return 'invModel';
      if (skill.userInvocable) return 'invUser';
      return 'invNone';
    }

    function sourceKey(source) {
      if (source === 'user') return 'sourceUser';
      if (source === 'agents') return 'sourceAgents';
      if (source === 'project') return 'sourceProject';
      return 'sourceCustom';
    }

    /** Registry publisher first, then the frontmatter author; never a bare numeric id. */
    function publisherOf(skill) {
      for (const candidate of [skill.publisherName, skill.author, skill.owner]) {
        if (typeof candidate !== 'string') continue;
        const value = candidate.trim();
        if (value.length === 0 || /^\d+$/.test(value)) continue;
        return value;
      }
      return '';
    }

    /** One tiny external store shared between the page and the overlay. */
    function createStore(initial) {
      let current = initial;
      const listeners = new Set();
      return {
        get: () => current,
        set(next) {
          if (current === next) return;
          current = next;
          for (const listener of Array.from(listeners)) listener();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      };
    }

    function useSkills(route, revision) {
      const [state, setState] = useState({ status: 'loading', data: null, error: null });
      const [tick, setTick] = useState(0);
      useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setState((previous) => ({
          status: previous.data === null ? 'loading' : 'refreshing',
          data: previous.data,
          error: null,
        }));
        fetch(route, { signal: controller.signal, headers: { accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
          })
          .then((data) => {
            if (active) setState({ status: 'ready', data, error: null });
          })
          .catch((error) => {
            if (!active || error === undefined || error === null || error.name === 'AbortError') return;
            setState((previous) => ({
              status: 'error',
              data: previous.data,
              error: String(error.message || error),
            }));
          });
        return () => {
          active = false;
          controller.abort();
        };
      }, [route, tick, revision]);
      const reload = useCallback(() => setTick((value) => value + 1), []);
      return { ...state, reload };
    }

    function useLocale(ctx) {
      const subscribe = useCallback((onChange) => ctx.locale.subscribe(onChange), []);
      const getSnapshot = useCallback(() => ctx.locale.getSnapshot(), []);
      return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    }

    function useCopyPath() {
      const [copied, setCopied] = useState(false);
      const timer = useRef(null);
      useEffect(() => () => {
        if (timer.current !== null) clearTimeout(timer.current);
      }, []);
      const copy = useCallback((text) => {
        const done = () => {
          setCopied(true);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1600);
        };
        try {
          const pending = navigator.clipboard.writeText(text);
          if (pending !== undefined && typeof pending.then === 'function') pending.then(done, () => {});
          else done();
        } catch {
          /* clipboard unavailable */
        }
      }, []);
      const reset = useCallback(() => setCopied(false), []);
      return { copied, copy, reset };
    }

    /** Ask the Host to delete one skill after the confirmation dialog. */
    async function requestUninstall(id) {
      const response = await fetch(UNINSTALL_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(payload !== null && typeof payload.error === 'string' ? payload.error : 'HTTP ' + response.status);
      }
      return payload;
    }

    function createPage(ctx, t, selection, revision) {
      return function SkillGalleryPage() {
        const snapshot = useLocale(ctx);
        const localeId = snapshot.active;
        const revisionValue = useSyncExternalStore(revision.subscribe, revision.get, revision.get);
        const { status, data, error, reload } = useSkills(ROUTE, revisionValue);
        const current = useSyncExternalStore(selection.subscribe, selection.get, selection.get);
        const [query, setQuery] = useState('');

        useEffect(() => () => selection.set(null), [selection]);

        const skills = data !== null && Array.isArray(data.skills) ? data.skills : [];
        const totalBytes = useMemo(() => skills.reduce((sum, skill) => sum + (Number(skill.bytes) || 0), 0), [skills]);
        const normalized = query.trim().toLowerCase();
        const visible = useMemo(() => {
          if (normalized.length === 0) return skills;
          return skills.filter((skill) => {
            const haystack = [skill.title, skill.name, skill.zhName, skill.registryName, skill.slug, skill.description, skill.owner]
              .concat(Array.isArray(skill.tags) ? skill.tags : [])
              .filter((part) => typeof part === 'string' && part.length > 0)
              .join(' ')
              .toLowerCase();
            return haystack.includes(normalized);
          });
        }, [skills, normalized]);

        const metaItem = (icon, text) => h('span', { className: 'skg-meta-item' }, icon(), h('span', null, text));

        const renderCard = (skill) => {
          const active = current !== null && current.skill.id === skill.id;
          const title = displayTitleOf(skill);
          const subtitle = subtitleOf(skill);
          return h(
            'article',
            { key: skill.id, className: 'skg-card' + (active ? ' skg-card-active' : '') },
            h(
              'div',
              { className: 'skg-card-body' },
              h(
                'div',
                { className: 'skg-card-main' },
                h(
                  'div',
                  { className: 'skg-title-row' },
                  h('span', { className: 'skg-title', title: title + (subtitle ? ' · ' + subtitle : '') }, title),
                  h('span', { className: 'skg-badge' }, t('installed')),
                  typeof skill.version === 'string' && skill.version.length > 0
                    ? h('span', { className: 'skg-version' }, 'v' + skill.version)
                    : null,
                ),
                h('div', { className: 'skg-slug', title: subtitle }, subtitle),
                h('p', { className: 'skg-desc' }, skill.description || t('noDescription')),
                h(
                  'div',
                  { className: 'skg-meta' },
                  metaItem(FileIcon, t('files', { n: skill.files })),
                  metaItem(DiskIcon, formatBytes(skill.bytes)),
                ),
                typeof skill.updatedAt === 'string' && skill.updatedAt.length > 0
                  ? h(
                      'div',
                      { className: 'skg-meta skg-meta-date' },
                      metaItem(ClockIcon, t('updated', { date: formatDate(skill.updatedAt, localeId) })),
                    )
                  : null,
              ),
            ),
            h(
              'div',
              { className: 'skg-foot' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'skg-btn',
                  'aria-haspopup': 'dialog',
                  onClick: () => selection.set({ skill, mode: 'detail' }),
                },
                t('detail'),
              ),
              h(
                'button',
                { type: 'button', className: 'skg-btn skg-btn-danger', onClick: () => selection.set({ skill, mode: 'uninstall' }) },
                t('uninstall'),
              ),
            ),
          );
        };

        const showSkeleton = status === 'loading' && data === null;
        const showError = status === 'error' && data === null;
        const refreshing = status === 'refreshing' || (status === 'loading' && data !== null);

        return h(
          'div',
          { className: 'skg-page', 'aria-label': t('title'), 'data-testid': 'skill-gallery-page' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'skg-scroll' },
            h(
              'div',
              { className: 'skg-content' },
              h(
                'div',
                { className: 'skg-head' },
                h('div', null, h('h1', null, t('title')), h('p', { className: 'skg-sub' }, t('subtitle'))),
                h(
                  'button',
                  { type: 'button', className: 'skg-refresh', disabled: status === 'loading', onClick: reload },
                  h('span', { className: refreshing ? 'skg-spin' : undefined }, RefreshIcon()),
                  t('refresh'),
                ),
              ),
              h(
                'div',
                { className: 'skg-toolbar' },
                h(
                  'label',
                  { className: 'skg-search' },
                  SearchIcon(),
                  h('input', {
                    value: query,
                    onChange: (event) => setQuery(event.target.value),
                    placeholder: t('search'),
                    'aria-label': t('search'),
                    type: 'search',
                  }),
                ),
                h('span', { className: 'skg-spacer' }),
                data !== null
                  ? h('span', { className: 'skg-stats' }, t('stats', { n: skills.length, size: formatBytes(totalBytes) }))
                  : null,
              ),
              showSkeleton
                ? h(
                    'div',
                    { className: 'skg-grid skg-sk-pulse', 'aria-busy': 'true' },
                    [0, 1, 2].map((index) =>
                      h(
                        'div',
                        { key: index, className: 'skg-skeleton' },
                        h('div', { className: 'skg-sk-line w60' }),
                        h('div', { className: 'skg-sk-line' }),
                        h('div', { className: 'skg-sk-line w80' }),
                      ),
                    ),
                  )
                : showError
                  ? h(
                      'div',
                      { className: 'skg-msg skg-error', role: 'alert' },
                      h('span', { className: 'skg-msg-icon' }, h(GalleryIcon, { size: 28 })),
                      h('p', { className: 'skg-msg-title' }, t('errorTitle')),
                      h('p', { className: 'skg-msg-hint' }, error || ''),
                      h('button', { type: 'button', className: 'skg-btn', onClick: reload }, t('retry')),
                    )
                  : skills.length === 0
                    ? h(
                        'div',
                        { className: 'skg-msg' },
                        h('span', { className: 'skg-msg-icon' }, h(GalleryIcon, { size: 28 })),
                        h('p', { className: 'skg-msg-title' }, t('emptyTitle')),
                        h('p', { className: 'skg-msg-hint' }, t('emptyHint')),
                        h('button', { type: 'button', className: 'skg-btn', onClick: reload }, t('refresh')),
                      )
                    : visible.length === 0
                      ? h(
                          'div',
                          { className: 'skg-msg' },
                          h('span', { className: 'skg-msg-icon' }, h(GalleryIcon, { size: 28 })),
                          h('p', { className: 'skg-msg-title' }, t('noResults')),
                          h('p', { className: 'skg-msg-hint' }, t('noResultsHint')),
                        )
                      : h(
                          'div',
                          { className: 'skg-grid', 'data-refreshing': refreshing ? 'true' : 'false' },
                          visible.map(renderCard),
                        ),
            ),
          ),
        );
      };
    }

    function createOverlay(ctx, t, selection, revision) {
      return function SkillOverlay() {
        const snapshot = useLocale(ctx);
        const localeId = snapshot.active;
        const current = useSyncExternalStore(selection.subscribe, selection.get, selection.get);
        const skill = current === null ? null : current.skill;
        const mode = current === null ? 'detail' : current.mode;
        const dialogKey = skill === null ? null : skill.id + ':' + mode;
        const dialogRef = useRef(null);
        const closeRef = useRef(null);
        const { copied, copy, reset: resetCopied } = useCopyPath();
        const [uninstalling, setUninstalling] = useState(false);
        const [removeError, setRemoveError] = useState(null);

        useEffect(() => {
          if (dialogKey === null) return undefined;
          resetCopied();
          setUninstalling(false);
          setRemoveError(null);
          const previous = typeof document === 'undefined' ? null : document.activeElement;
          if (closeRef.current !== null) closeRef.current.focus();
          return () => {
            if (previous !== null && typeof previous.focus === 'function') {
              try {
                previous.focus();
              } catch {
                /* the trigger is gone */
              }
            }
          };
        }, [dialogKey, resetCopied]);

        useEffect(() => {
          if (dialogKey === null) return undefined;
          const onKeyDown = (event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              selection.set(null);
              return;
            }
            if (event.key !== 'Tab' || dialogRef.current === null) return;
            const focusable = Array.from(
              dialogRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
            ).filter((node) => node.getAttribute('aria-hidden') !== 'true' && !node.hasAttribute('disabled'));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          };
          window.addEventListener('keydown', onKeyDown, true);
          return () => window.removeEventListener('keydown', onKeyDown, true);
        }, [dialogKey, selection]);

        if (skill === null) return null;

        const title = displayTitleOf(skill);
        const subtitle = subtitleOf(skill);
        const sourceLabel = t(sourceKey(skill.source));
        const publisher = publisherOf(skill);
        const close = () => selection.set(null);

        const confirmUninstall = () => {
          if (uninstalling) return;
          setUninstalling(true);
          setRemoveError(null);
          requestUninstall(skill.id)
            .then(() => {
              revision.set(revision.get() + 1);
              selection.set(null);
            })
            .catch((failure) => {
              setRemoveError(String(failure.message || failure));
            })
            .finally(() => {
              setUninstalling(false);
            });
        };

        if (mode === 'uninstall') {
          return h(
            React.Fragment,
            null,
            h('style', null, CSS),
            h(
              'div',
              {
                className: 'skg-overlay',
                onClick: (event) => {
                  if (event.target === event.currentTarget) close();
                },
              },
              h(
                'div',
                {
                  className: 'skg-dialog skg-dialog-sm',
                  role: 'dialog',
                  'aria-modal': 'true',
                  'aria-labelledby': 'skg-remove-title',
                  ref: dialogRef,
                  onMouseDown: (event) => event.stopPropagation(),
                },
                h(
                  'header',
                  { className: 'skg-dialog-head' },
                  h(
                    'div',
                    { className: 'skg-dialog-ident' },
                    h('h2', { id: 'skg-remove-title', className: 'skg-dialog-title' }, t('uninstallTitle')),
                  ),
                  h(
                    'button',
                    { ref: closeRef, type: 'button', className: 'skg-dialog-close', 'aria-label': t('close'), onClick: close },
                    CloseIcon(),
                  ),
                ),
                h(
                  'div',
                  { className: 'skg-confirm-body' },
                  h('p', { className: 'skg-confirm-text' }, t('uninstallConfirm', { title })),
                  h('p', { className: 'skg-confirm-path' }, locationOf(skill)),
                  h('p', { className: 'skg-confirm-hint' }, t('uninstallHint')),
                  removeError !== null
                    ? h('p', { className: 'skg-confirm-error', role: 'alert' }, t('uninstallFailed', { message: removeError }))
                    : null,
                ),
                h(
                  'footer',
                  { className: 'skg-dialog-foot' },
                  h('span', { className: 'skg-source', title: locationOf(skill) }, FolderIcon(), sourceLabel),
                  h(
                    'div',
                    { className: 'skg-dialog-actions' },
                    h('button', { type: 'button', className: 'skg-btn', disabled: uninstalling, onClick: close }, t('cancel')),
                    h(
                      'button',
                      { type: 'button', className: 'skg-btn skg-btn-danger', disabled: uninstalling, onClick: confirmUninstall },
                      uninstalling ? t('uninstalling') : t('uninstall'),
                    ),
                  ),
                ),
              ),
            ),
          );
        }

        const chip = (label, value) =>
          h('span', { className: 'skg-chip' }, h('span', { className: 'skg-chip-label' }, label), h('span', null, value));
        const row = (label, value, valueClass) =>
          h('div', { className: 'skg-detail' }, h('dt', null, label), h('dd', { className: valueClass }, value));

        return h(
          React.Fragment,
          null,
          h('style', null, CSS),
          h(
            'div',
            {
              className: 'skg-overlay',
              onClick: (event) => {
                if (event.target === event.currentTarget) close();
              },
            },
            h(
              'div',
              {
                className: 'skg-dialog',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'skg-dialog-title',
                ref: dialogRef,
                onMouseDown: (event) => event.stopPropagation(),
              },
              h(
                'header',
                { className: 'skg-dialog-head' },
                h(
                  'div',
                  { className: 'skg-dialog-ident' },
                  h('h2', { id: 'skg-dialog-title', className: 'skg-dialog-title' }, title),
                  h('div', { className: 'skg-dialog-slug' }, subtitle),
                  h(
                    'div',
                    { className: 'skg-dialog-badges' },
                    h('span', { className: 'skg-badge' }, t('installed')),
                    typeof skill.version === 'string' && skill.version.length > 0
                      ? h('span', { className: 'skg-version' }, 'v' + skill.version)
                      : null,
                  ),
                ),
                h(
                  'button',
                  { ref: closeRef, type: 'button', className: 'skg-dialog-close', 'aria-label': t('close'), onClick: close },
                  CloseIcon(),
                ),
              ),
              h(
                'div',
                { className: 'skg-dialog-body' },
                h('p', { className: 'skg-dialog-desc' }, skill.description || t('noDescription')),
                h(
                  'div',
                  { className: 'skg-chips' },
                  chip(t('fileCountLabel'), String(skill.files)),
                  chip(t('sizeLabel'), formatBytes(skill.bytes)),
                  typeof skill.updatedAt === 'string' && skill.updatedAt.length > 0
                    ? chip(t('updatedLabel'), formatDate(skill.updatedAt, localeId))
                    : null,
                ),
                h(
                  'dl',
                  { className: 'skg-dialog-rows' },
                  h(
                    'div',
                    { className: 'skg-detail' },
                    h('dt', null, t('path')),
                    h(
                      'dd',
                      { className: 'skg-path-cell' },
                      h('span', { className: 'skg-mono' }, locationOf(skill)),
                      h(
                        'button',
                        { type: 'button', className: 'skg-copy-btn', onClick: () => copy(locationOf(skill)) },
                        copied ? t('copied') : t('copyPath'),
                      ),
                    ),
                  ),
                  row(t('source'), skill.via === 'skillhub' ? t('viaSkillhub') : sourceLabel),
                  row(t('invocation'), t(invocationKey(skill))),
                  publisher.length > 0 ? row(t('owner'), publisher) : null,
                ),
              ),
              h(
                'footer',
                { className: 'skg-dialog-foot' },
                h('span', { className: 'skg-source', title: locationOf(skill) }, FolderIcon(), sourceLabel),
                h(
                  'div',
                  { className: 'skg-dialog-actions' },
                  h(
                    'button',
                    { type: 'button', className: 'skg-btn skg-btn-danger', onClick: () => selection.set({ skill, mode: 'uninstall' }) },
                    t('uninstall'),
                  ),
                  h('button', { type: 'button', className: 'skg-btn', onClick: close }, t('close')),
                ),
              ),
            ),
          ),
        );
      };
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-gallery: dictionaries');
      const t = ctx.locale.bind(NS);
      const selection = createStore(null);
      const revision = createStore(0);
      const Page = createPage(ctx, t, selection, revision);
      const Overlay = createOverlay(ctx, t, selection, revision);

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            label: () => t('panel'),
          },
          Page,
        ),
      );

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'skill-gallery.detail',
            order: 40,
            locale: NS,
          },
          Overlay,
        ),
      );

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 30,
            locale: NS,
            label: () => t('panel'),
          },
          GalleryIcon,
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
