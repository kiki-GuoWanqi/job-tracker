// ══════════════════════════════════════════
//  常量
// ══════════════════════════════════════════
const PRESET_STATUSES = ['待投递', '已投递待回复', '待笔试', '笔试完待通知', '面试中', '已 Offer', '已挂'];

const ROUND_OPTIONS = ['一面', '二面', '三面', '四面+'];
const ROUND_PICKER_OPTIONS = ['一面', '二面', '三面', '四面', '五面', '六面'];
const INTERVIEW_ROUNDS    = ['一面', '二面', '三面', '四面', '五面', '六面', 'HR面'];

const STATUS_BADGE = {
  '待投递':      { bg: 'bg-zinc-100',   text: 'text-zinc-700',   dot: 'bg-zinc-400'   },
  '已投递待回复': { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500'   },
  '待笔试':      { bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-500' },
  '笔试完待通知': { bg: 'bg-indigo-50',  text: 'text-indigo-700', dot: 'bg-indigo-500' },
  '面试中':      { bg: 'bg-amber-50',   text: 'text-amber-800',  dot: 'bg-amber-500'  },
  '已 Offer':    { bg: 'bg-emerald-50', text: 'text-emerald-700',dot: 'bg-emerald-500'},
  '已挂':        { bg: 'bg-rose-50',    text: 'text-rose-600',   dot: 'bg-rose-400'   },
};

function statusBadgeClass(status) {
  const s = STATUS_BADGE[status] || { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' };
  return `${s.bg} ${s.text}`;
}

function statusDotClass(status) {
  const s = STATUS_BADGE[status] || { dot: 'bg-violet-500' };
  return `${s.dot} ${s.dot.replace('bg-', 'text-')}`;
}

// ══════════════════════════════════════════
//  PDF.js / mammoth.js — 浏览器端文本提取（保留）
// ══════════════════════════════════════════
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map(it => it.str).join(''));
  }
  return parts.join('\n').trim();
}

async function extractDocxText(file) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value.trim();
}

// ══════════════════════════════════════════
//  AI 调用 — 全部通过后端 /api/ai 代理
// ══════════════════════════════════════════
async function callTextAI(systemPrompt, userContent, purpose) {
  const data = await JobTrackerAPI.ai.text({ system: systemPrompt, user: userContent, purpose });
  return (data.content || '').trim();
}

async function extractJDFromImage(base64, mimeType, purpose = 'jd_ocr') {
  const visionPrompt = '请完整提取图片中的职位描述文字，保持原文内容，不要添加任何解释或额外内容。';
  const data = await JobTrackerAPI.ai.vision({ prompt: visionPrompt, base64, mimeType, purpose });
  return (data.content || '').trim();
}

const JD_FORMAT_PROMPT = '你是职位描述整理助手，输出纯 Markdown，不加额外说明文字。';
const JD_FORMAT_USER   = (jd) =>
  `将下面的职位描述整理为结构化 Markdown，包含以下段落（如原文有对应内容）：职位概述、岗位职责、任职要求、加分项、薪资福利。保持原文关键信息，精简冗余措辞。\n\n---\n${jd}`;

// ══════════════════════════════════════════
//  Vue App
// ══════════════════════════════════════════
const { createApp, ref, reactive, computed, watch, onMounted } = Vue;

createApp({
  setup() {
    // ── 加载状态 ──
    const loading = ref(true);
    const loadError = ref('');

    // ── 路由状态 ──
    const page = ref('list');
    const routeId = ref('');

    function parseRoute() {
      const hash = window.location.hash.replace(/^#\/?/, '') || 'list';
      const [p, id = ''] = hash.split('/');
      const valid = ['list', 'add', 'edit', 'detail', 'review', 'settings', 'offers', 'archived', 'calendar'];
      page.value = valid.includes(p) ? p : 'notfound';
      routeId.value = id;
    }

    function goDetail(id) {
      window.location.hash = '#detail/' + id;
    }

    function navClass(pages) {
      const active = pages.includes(page.value);
      return [
        'text-sm font-medium px-3 py-1.5 rounded-md transition-colors',
        active
          ? 'bg-zinc-100 text-zinc-900'
          : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/60',
      ];
    }

    // ── 数据状态（异步从后端加载） ──
    const applications = ref([]);
    const settings = ref({
      defaultResumeId: '',
      customStatuses: [],
      resumes: [],
      hasDeepseekKey: false,
      hasQwenKey: false,
      hasOpenaiKey: false,
      hasAnthropicKey: false,
      aiProviders: {},      // { deepseek: { hasKey, keyPreview, baseUrl, textModel, visionModel }, ... }
      aiRouting: {},        // { jd_format: 'deepseek', ... }
      aiProviderMeta: {},   // { deepseek: { key, label, defaultBaseUrl, ... }, ... }
      aiPurposes: []        // [{ key, label, kind }, ...]
    });

    function hasAnyKey() {
      const ap = settings.value.aiProviders || {};
      return Object.values(ap).some(p => p && p.hasKey);
    }

    // ── 后端持久化层（debounced dirty-set） ──
    // 每条 application 上次发送的 JSON 序列化结果，用 id 作 key
    const lastSentByAppId = new Map();
    const dirtySet = new Set();
    let flushTimer = null;
    let suppressWatch = false;  // 后端 reload 后避免触发 watch

    function serializeApp(app) {
      return JSON.stringify(app);
    }

    function markAllClean() {
      lastSentByAppId.clear();
      for (const a of applications.value) {
        lastSentByAppId.set(a.id, serializeApp(a));
      }
      dirtySet.clear();
    }

    async function flushDirty() {
      flushTimer = null;
      if (dirtySet.size === 0) return;
      const ids = Array.from(dirtySet);
      for (const id of ids) {
        const app = applications.value.find(a => a.id === id);
        if (!app) {
          dirtySet.delete(id);
          continue;
        }
        try {
          const updated = await JobTrackerAPI.applications.update(id, app);
          dirtySet.delete(id);
          lastSentByAppId.set(id, serializeApp(app));
          // 同步 updatedAt 等服务端字段，但避免触发新的 dirty 标记
          if (updated && typeof updated === 'object') {
            suppressWatch = true;
            app.updatedAt = updated.updatedAt || app.updatedAt;
            // 状态历史以服务端为准（避免重复）
            if (Array.isArray(updated.statusHistory)) {
              app.statusHistory = updated.statusHistory;
            }
            lastSentByAppId.set(id, serializeApp(app));
            queueMicrotask(() => { suppressWatch = false; });
          }
        } catch (err) {
          console.error('保存失败:', id, err);
          // 留在 dirtySet，等下次再试
        }
      }
    }

    function scheduleFlush() {
      if (flushTimer) return;
      flushTimer = setTimeout(flushDirty, 500);
    }

    // 监听 applications 数组，diff 出哪些条变化加入 dirtySet
    watch(applications, () => {
      if (suppressWatch) return;
      const currentIds = new Set();
      for (const app of applications.value) {
        currentIds.add(app.id);
        const cur = serializeApp(app);
        const last = lastSentByAppId.get(app.id);
        if (last !== cur) {
          dirtySet.add(app.id);
          lastSentByAppId.set(app.id, cur);
        }
      }
      // 不在数组中的 id 视为已删除，不在 dirtySet 里持久化（删除走显式 API）
      for (const id of Array.from(lastSentByAppId.keys())) {
        if (!currentIds.has(id)) lastSentByAppId.delete(id);
      }
      if (dirtySet.size > 0) scheduleFlush();
    }, { deep: true });

    // ── settings 持久化（debounced） ──
    let settingsFlushTimer = null;
    let lastSentSettings = '';
    function scheduleSettingsFlush() {
      if (settingsFlushTimer) return;
      settingsFlushTimer = setTimeout(async () => {
        settingsFlushTimer = null;
        const payload = {
          defaultResumeId: settings.value.defaultResumeId || '',
          customStatuses: Array.isArray(settings.value.customStatuses) ? settings.value.customStatuses : []
        };
        const ser = JSON.stringify(payload);
        if (ser === lastSentSettings) return;
        try {
          const updated = await JobTrackerAPI.settings.update(payload);
          settings.value.hasDeepseekKey = Boolean(updated.hasDeepseekKey);
          settings.value.hasQwenKey = Boolean(updated.hasQwenKey);
          lastSentSettings = ser;
        } catch (e) {
          console.error('settings 保存失败', e);
        }
      }, 500);
    }

    watch(() => [settings.value.defaultResumeId, settings.value.customStatuses], () => {
      if (suppressWatch) return;
      scheduleSettingsFlush();
    }, { deep: true });

    // ── 初始化加载 + localStorage 迁移检测 ──
    const migrationOpen = ref(false);
    const migrationCount = ref(0);
    const migrationLoading = ref(false);
    const migrationError = ref('');

    function hasLegacyLocalData() {
      try {
        const raw = localStorage.getItem('jobtracker_applications');
        if (!raw) return 0;
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.length : 0;
      } catch { return 0; }
    }

    async function reloadAll() {
      suppressWatch = true;
      try {
        const [apps, st, resumes] = await Promise.all([
          JobTrackerAPI.applications.list(),
          JobTrackerAPI.settings.get(),
          JobTrackerAPI.resumes.list()
        ]);
        applications.value = apps;
        settings.value = {
          defaultResumeId: st.defaultResumeId || '',
          customStatuses: st.customStatuses || [],
          resumes: resumes || [],
          hasDeepseekKey: Boolean(st.hasDeepseekKey),
          hasQwenKey: Boolean(st.hasQwenKey),
          hasOpenaiKey: Boolean(st.hasOpenaiKey),
          hasAnthropicKey: Boolean(st.hasAnthropicKey),
          aiProviders: st.aiProviders || {},
          aiRouting: st.aiRouting || {},
          aiProviderMeta: st.aiProviderMeta || {},
          aiPurposes: st.aiPurposes || []
        };
        markAllClean();
        lastSentSettings = JSON.stringify({
          defaultResumeId: settings.value.defaultResumeId,
          customStatuses: settings.value.customStatuses
        });
      } finally {
        queueMicrotask(() => { suppressWatch = false; });
      }
    }

    async function performMigration() {
      migrationLoading.value = true;
      migrationError.value = '';
      try {
        const appsRaw = localStorage.getItem('jobtracker_applications');
        const setRaw = localStorage.getItem('jobtracker_settings');
        const appsArr = appsRaw ? JSON.parse(appsRaw) : [];
        const setObj = setRaw ? JSON.parse(setRaw) : {};
        // 旧版可能没 statusHistory，自动补
        for (const app of appsArr) {
          if (!Array.isArray(app.statusHistory) || app.statusHistory.length === 0) {
            app.statusHistory = [{
              status: app.status || '已投递待回复',
              round: app.interviewRound || '',
              changedAt: app.createdAt || new Date().toISOString()
            }];
          }
        }
        // 兼容旧的单简历字段：若 resumes 为空但有 resumeText，自动迁移
        if ((!Array.isArray(setObj.resumes) || setObj.resumes.length === 0) && setObj.resumeText) {
          const id = crypto.randomUUID();
          setObj.resumes = [{
            id,
            label: '默认简历',
            fileName: setObj.resumeFileName || '我的简历',
            text: setObj.resumeText,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }];
          setObj.defaultResumeId = id;
        }
        const payload = {
          applications: appsArr,
          settings: {
            resumes: Array.isArray(setObj.resumes) ? setObj.resumes : [],
            defaultResumeId: setObj.defaultResumeId || '',
            customStatuses: Array.isArray(setObj.customStatuses) ? setObj.customStatuses : []
          }
        };
        await JobTrackerAPI.backup.import(payload);
        // 改名 localStorage 数据，作为本地备份
        const ts = Date.now();
        if (appsRaw) localStorage.setItem(`jobtracker_applications_migrated_${ts}`, appsRaw);
        if (setRaw) localStorage.setItem(`jobtracker_settings_migrated_${ts}`, setRaw);
        localStorage.removeItem('jobtracker_applications');
        localStorage.removeItem('jobtracker_settings');
        await reloadAll();
        migrationOpen.value = false;
      } catch (e) {
        migrationError.value = e.message || '迁移失败';
      } finally {
        migrationLoading.value = false;
      }
    }

    function dismissMigration() {
      migrationOpen.value = false;
    }

    // 设置页常驻的"从浏览器迁移"按钮
    async function manualMigrateFromLocalStorage() {
      const n = hasLegacyLocalData();
      if (n === 0) {
        alert('当前浏览器没有检测到旧版数据');
        return;
      }
      if (!confirm(`检测到 ${n} 条本地浏览器记录，迁移会与后端数据合并并覆盖，是否继续？`)) return;
      migrationCount.value = n;
      await performMigration();
      if (!migrationError.value) alert('迁移完成');
      else alert('迁移失败：' + migrationError.value);
    }

    // ── 导出 / 导入 ──
    async function exportData() {
      try {
        const data = await JobTrackerAPI.backup.export();
        const date = new Date().toISOString().slice(0, 10);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jobtracker-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('导出失败：' + e.message);
      }
    }

    const importInputRef = ref(null);
    function triggerImport() { importInputRef.value?.click(); }

    function handleImportFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!Array.isArray(data.applications)) throw new Error('JSON 格式不正确，缺少 applications 字段');
          const count = data.applications.length;
          if (!confirm(`确认导入？后端当前数据将被全部覆盖（文件含 ${count} 条投递记录）`)) return;
          await JobTrackerAPI.backup.import(data);
          await reloadAll();
          alert(`导入成功，共 ${count} 条记录`);
        } catch (err) {
          alert('导入失败：' + err.message);
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    }

    // ── 状态 / 轮次 / 搜索筛选 ──
    const filterStatus = ref('全部');
    const filterRound = ref('全部');
    const searchQuery = ref('');

    watch(filterStatus, (val) => {
      if (val !== '面试中') filterRound.value = '全部';
    });

    const allStatuses = computed(() =>
      [...PRESET_STATUSES, ...(settings.value.customStatuses || [])]
    );

    const filteredApplications = computed(() => {
      let list = applications.value;
      if (searchQuery.value.trim()) {
        const q = searchQuery.value.trim().toLowerCase();
        list = list.filter(a =>
          a.companyName.toLowerCase().includes(q) ||
          a.position.toLowerCase().includes(q) ||
          (a.workCity || '').toLowerCase().includes(q)
        );
      }
      if (filterStatus.value !== '全部') {
        list = list.filter(a => a.status === filterStatus.value);
      }
      if (filterStatus.value === '面试中' && filterRound.value !== '全部') {
        if (filterRound.value === '四面+') {
          list = list.filter(a => a.interviewRound && !['一面', '二面', '三面'].includes(a.interviewRound));
        } else {
          list = list.filter(a => a.interviewRound === filterRound.value);
        }
      }
      return [...list].sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
    });

    const searchedApplications = computed(() => {
      const q = searchQuery.value.trim().toLowerCase();
      if (!q) return applications.value;
      return applications.value.filter(a =>
        a.companyName.toLowerCase().includes(q) ||
        a.position.toLowerCase().includes(q) ||
        (a.workCity || '').toLowerCase().includes(q)
      );
    });

    const KANBAN_COLUMNS = [
      { key: 'pending',   title: '待投递',  statuses: ['待投递'],                  dot: 'bg-zinc-400'   },
      { key: 'submitted', title: '已投递',  statuses: ['已投递待回复'],            dot: 'bg-blue-500'   },
      { key: 'exam',      title: '笔试',    statuses: ['待笔试', '笔试完待通知'],  dot: 'bg-orange-500' },
      { key: 'interview', title: '面试中',  statuses: ['面试中'],                  dot: 'bg-amber-500'  },
    ];

    const kanbanColumns = computed(() => {
      return KANBAN_COLUMNS.map(col => {
        const items = searchedApplications.value
          .filter(a => col.statuses.includes(a.status))
          .sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
        return { ...col, items };
      });
    });

    const offerApps = computed(() =>
      searchedApplications.value
        .filter(a => a.status === '已 Offer')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );

    const archivedApps = computed(() =>
      searchedApplications.value
        .filter(a => a.status === '已挂')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );

    const offerCount    = computed(() => applications.value.filter(a => a.status === '已 Offer').length);
    const archivedCount = computed(() => applications.value.filter(a => a.status === '已挂').length);

    // ── 徽章 picker ──
    const activeBadgePicker = ref(null);
    const pickerStatus = ref('');
    const customRoundInput = ref('');
    const popoverStyle = ref({ left: '0px', top: '0px' });

    function openBadgePicker(app, event) {
      if (activeBadgePicker.value === app.id) { closeBadgePicker(); return; }
      activeBadgePicker.value = app.id;
      pickerStatus.value = app.status;
      customRoundInput.value = '';

      const btn = event?.currentTarget;
      if (btn) {
        const rect = btn.getBoundingClientRect();
        const POPOVER_WIDTH = 288;
        const MARGIN = 12;
        let left = rect.left;
        if (left + POPOVER_WIDTH + MARGIN > window.innerWidth) {
          left = window.innerWidth - POPOVER_WIDTH - MARGIN;
        }
        if (left < MARGIN) left = MARGIN;
        popoverStyle.value = {
          left: left + 'px',
          top:  (rect.bottom + 8) + 'px',
        };
      }
    }

    const pickerOfferSalary = ref('');

    function closeBadgePicker() {
      activeBadgePicker.value = null;
      pickerStatus.value = '';
      customRoundInput.value = '';
      pickerOfferSalary.value = '';
    }

    watch(activeBadgePicker, (id) => {
      const handler = () => closeBadgePicker();
      if (id) {
        window.addEventListener('scroll', handler, { passive: true, once: true });
        window.addEventListener('resize', handler, { once: true });
      }
    });

    // ── 状态变更：调用后端 status 端点（自动追加 status_history） ──
    async function changeStatus(appId, status, round = '', extra = {}) {
      const app = applications.value.find(a => a.id === appId);
      if (!app) return;
      // 乐观更新
      app.status = status;
      app.interviewRound = round || '';
      if (typeof extra.offerSalary === 'string') app.offerSalary = extra.offerSalary;
      if (status !== '已 Offer') app.offerSalary = '';
      app.updatedAt = new Date().toISOString();
      try {
        const payload = { status, round };
        if (typeof extra.offerSalary === 'string') payload.offerSalary = extra.offerSalary;
        const updated = await JobTrackerAPI.applications.changeStatus(appId, payload);
        suppressWatch = true;
        // 服务端权威响应：覆盖关键字段
        Object.assign(app, {
          status: updated.status,
          interviewRound: updated.interviewRound,
          offerSalary: updated.offerSalary,
          statusHistory: updated.statusHistory,
          updatedAt: updated.updatedAt
        });
        lastSentByAppId.set(appId, serializeApp(app));
        queueMicrotask(() => { suppressWatch = false; });
      } catch (e) {
        alert('状态切换失败：' + e.message);
      }
    }

    function selectStatus(appId, status) {
      pickerStatus.value = status;
      if (status !== '面试中' && status !== '已 Offer') {
        changeStatus(appId, status, '');
        closeBadgePicker();
      }
      if (status === '已 Offer') pickerOfferSalary.value = '';
    }

    function selectOfferSalary(appId, salary) {
      changeStatus(appId, '已 Offer', '', { offerSalary: salary });
      closeBadgePicker();
    }

    function submitOfferSalary(appId) {
      selectOfferSalary(appId, pickerOfferSalary.value.trim());
    }

    function selectRound(appId, round) {
      changeStatus(appId, '面试中', round.trim());
      closeBadgePicker();
    }

    function submitCustomRound(appId) {
      if (customRoundInput.value.trim()) selectRound(appId, customRoundInput.value);
    }

    // ── Kanban 拖拽 ──
    const draggingId = ref(null);
    const draggingFromStatus = ref('');
    const dragOverColKey = ref('');

    function handleDragStart(app, event) {
      draggingId.value = app.id;
      draggingFromStatus.value = app.status;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', app.id);
      closeBadgePicker();
    }

    function handleDragOver(col) {
      if (draggingId.value) dragOverColKey.value = col.key;
    }

    function handleDragLeave(event, col) {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        if (dragOverColKey.value === col.key) dragOverColKey.value = '';
      }
    }

    function handleDragEnd() {
      draggingId.value = null;
      draggingFromStatus.value = '';
      dragOverColKey.value = '';
    }

    function handleDrop(col, event) {
      event.preventDefault();
      const appId = event.dataTransfer.getData('text/plain') || draggingId.value;
      handleDragEnd();
      const app = applications.value.find(a => a.id === appId);
      if (!app) return;
      if (col.statuses.includes(app.status)) return;
      const target = col.statuses[0];
      const round = target === '面试中' ? (app.interviewRound || '一面') : '';
      changeStatus(appId, target, round);
    }

    // ── 简历管理（直连 /api/resumes） ──
    const resumeInputRef = ref(null);
    const resumeLoading  = ref(false);
    const resumeError    = ref('');
    const editingResumeId = ref(null);
    const manualResumeText = ref('');
    const manualResumeName = ref('');

    async function handleResumeFile(event) {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['pdf', 'docx'].includes(ext)) {
        resumeError.value = '仅支持 PDF 和 .docx 格式';
        return;
      }
      resumeLoading.value = true;
      resumeError.value   = '';
      try {
        const text = ext === 'pdf' ? await extractPdfText(file) : await extractDocxText(file);
        if (!text) throw new Error('未能提取到文字（PDF 可能是扫描件，请使用手动粘贴）');
        await addResume({
          label: file.name.replace(/\.(pdf|docx)$/i, ''),
          fileName: file.name,
          text,
        });
      } catch (err) {
        resumeError.value = err.message || '提取失败，请使用手动粘贴';
      } finally {
        resumeLoading.value = false;
      }
    }

    async function addResume({ label, fileName, text }) {
      try {
        const created = await JobTrackerAPI.resumes.create({
          label: (label || '未命名简历').trim(),
          fileName: fileName || '',
          text: text || ''
        });
        if (!Array.isArray(settings.value.resumes)) settings.value.resumes = [];
        settings.value.resumes.unshift(created);
        if (!settings.value.defaultResumeId) {
          settings.value.defaultResumeId = created.id;
        }
        return created.id;
      } catch (e) {
        resumeError.value = e.message || '保存简历失败';
        throw e;
      }
    }

    async function removeResume(id) {
      if (!confirm('确认删除这份简历？关联到它的投递将变为「未关联」。')) return;
      try {
        await JobTrackerAPI.resumes.remove(id);
        settings.value.resumes = (settings.value.resumes || []).filter(r => r.id !== id);
        if (settings.value.defaultResumeId === id) {
          settings.value.defaultResumeId = settings.value.resumes[0]?.id || '';
        }
        applications.value.forEach(app => {
          if (app.resumeId === id) app.resumeId = '';
        });
      } catch (e) {
        alert('删除简历失败：' + e.message);
      }
    }

    function setDefaultResume(id) {
      settings.value.defaultResumeId = id;
    }

    async function updateResumeLabel(id, label) {
      const r = (settings.value.resumes || []).find(x => x.id === id);
      if (!r) return;
      const newLabel = label.trim() || '未命名简历';
      r.label = newLabel;
      r.updatedAt = new Date().toISOString();
      editingResumeId.value = null;
      try {
        await JobTrackerAPI.resumes.update(id, { label: newLabel });
      } catch (e) {
        alert('更新简历名称失败：' + e.message);
      }
    }

    async function addManualResume() {
      const text = manualResumeText.value.trim();
      if (!text) { resumeError.value = '简历内容不能为空'; return; }
      try {
        await addResume({
          label: manualResumeName.value.trim() || '手动粘贴的简历',
          fileName: '',
          text,
        });
        manualResumeText.value = '';
        manualResumeName.value = '';
        resumeError.value = '';
      } catch {}
    }

    function resumeOf(app) {
      if (!app?.resumeId) return null;
      return (settings.value.resumes || []).find(r => r.id === app.resumeId) || null;
    }

    const defaultResume = computed(() => {
      const list = settings.value.resumes || [];
      if (!list.length) return null;
      return list.find(r => r.id === settings.value.defaultResumeId) || list[0];
    });

    // ── 自定义状态 ──
    const newCustomStatus = ref('');

    function addCustomStatus() {
      const s = newCustomStatus.value.trim();
      if (!s) return;
      if (!settings.value.customStatuses) settings.value.customStatuses = [];
      if (settings.value.customStatuses.includes(s)) return;
      settings.value.customStatuses.push(s);
      newCustomStatus.value = '';
    }

    function removeCustomStatus(s) {
      settings.value.customStatuses = settings.value.customStatuses.filter(x => x !== s);
    }

    // ── 面经 ──
    const sortedInterviews = computed(() =>
      currentApp.value
        ? [...currentApp.value.interviews].sort((a, b) => b.date.localeCompare(a.date))
        : []
    );

    const interviewFormOpen = ref(false);
    const editingInterviewId = ref(null);

    const iForm = reactive({
      date: '', round: '', notes: '', questions: [],
    });

    function openAddInterview() {
      Object.assign(iForm, { date: new Date().toISOString().slice(0, 10), round: '', notes: '', questions: [] });
      editingInterviewId.value = null;
      interviewFormOpen.value = true;
    }

    function openEditInterview(interview) {
      Object.assign(iForm, {
        date: interview.date, round: interview.round, notes: interview.notes,
        questions: interview.questions.map(q => ({ ...q, refAnswer: q.refAnswer || '' })),
      });
      editingInterviewId.value = interview.id;
      interviewFormOpen.value = true;
    }

    function cancelInterview() {
      interviewFormOpen.value = false;
      editingInterviewId.value = null;
    }

    function saveInterview() {
      const app = applications.value.find(a => a.id === routeId.value);
      if (!app) return;
      const record = {
        id: editingInterviewId.value || crypto.randomUUID(),
        date: iForm.date || new Date().toISOString().slice(0, 10),
        round: iForm.round,
        notes: iForm.notes,
        questions: iForm.questions.map(q => ({ ...q })),
      };
      if (!editingInterviewId.value) {
        app.interviews.push(record);
      } else {
        const idx = app.interviews.findIndex(i => i.id === editingInterviewId.value);
        if (idx !== -1) app.interviews[idx] = record;
      }
      app.updatedAt = new Date().toISOString();
      cancelInterview();
    }

    function deleteInterview(id) {
      if (!confirm('确认删除这条面试记录？')) return;
      const app = applications.value.find(a => a.id === routeId.value);
      if (app) app.interviews = app.interviews.filter(i => i.id !== id);
      cancelInterview();
    }

    function addQuestion() {
      iForm.questions.push({ id: crypto.randomUUID(), question: '', answer: '', refAnswer: '' });
    }

    function removeQuestion(idx) {
      iForm.questions.splice(idx, 1);
    }

    // ── AI 生成面试参考答案 ──
    const aiRefLoadingMap = ref({});

    async function generateRefAnswer(q) {
      const app = applications.value.find(a => a.id === routeId.value);
      if (!app) return;
      if (!hasAnyKey()) {
        alert('后端未配置 AI Key，请编辑 .env 中的 DEEPSEEK_API_KEY 或 QWEN_API_KEY 后重启服务');
        return;
      }
      if (!q.question.trim()) { alert('请先填写面试题目'); return; }
      if (q.refAnswer && !confirm('将覆盖已有参考答案，确认重新生成？')) return;

      aiRefLoadingMap.value[q.id] = true;
      const jdContext = app.jdFormatted || app.jdRaw || '';
      const system = '你是一位资深面试辅导顾问。直接输出面试参考答案，不要添加任何解释、点评或"为什么这样回答好"之类的说明，不要有前言或总结，用中文回答。';
      const user = `岗位：${app.position}\n公司：${app.companyName}${jdContext ? '\n\n职位描述（JD）：\n' + jdContext : ''}\n\n面试题目：\n${q.question}`;
      try {
        q.refAnswer = await callTextAI(system, user, 'ref_answer');
      } catch (err) {
        alert('AI 生成失败：' + (err.message || '请重试'));
      } finally {
        aiRefLoadingMap.value[q.id] = false;
      }
    }

    // ── 测试数据 ──
    function addTestRecord() {
      const idx = applications.value.length;
      const status = PRESET_STATUSES[idx % PRESET_STATUSES.length];
      const interviewRound = status === '面试中' ? ROUND_OPTIONS[idx % ROUND_OPTIONS.length] : '';
      const now = new Date().toISOString();
      applications.value.push({
        id: crypto.randomUUID(),
        companyName: ['腾讯', '字节跳动', '阿里巴巴', '美团', '百度', '网易', '京东', '滴滴'][idx % 8],
        position: ['前端工程师', '后端工程师', '产品经理', '数据分析师', 'iOS 工程师', 'Android 工程师', '算法工程师', '测试工程师'][idx % 8],
        applicationDate: new Date(Date.now() - idx * 86400000 * 2).toISOString().slice(0, 10),
        status,
        interviewRound,
        companyBrief: '测试公司简介。',
        jdRaw: '',
        jdFormatted: '',
        aiAnalysis: '',
        interviews: [],
        tasks: [],
        statusHistory: [{ status, round: interviewRound, changedAt: now }],
        createdAt: now,
        updatedAt: now,
      });
    }

    // ── 状态统计 + 过期检测 ──
    const statusStats = computed(() => {
      const map = {};
      applications.value.forEach(a => { map[a.status] = (map[a.status] || 0) + 1; });
      return allStatuses.value.filter(s => map[s]).map(s => ({ status: s, count: map[s] }));
    });

    function isStale(app) {
      const last = new Date(app.updatedAt || app.createdAt);
      const days = (Date.now() - last.getTime()) / 86400000;
      return days > 7 && !['已 Offer', '已挂'].includes(app.status);
    }

    function daysUntil(dateStr) {
      if (!dateStr) return null;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const target = new Date(dateStr + 'T00:00:00');
      if (isNaN(target.getTime())) return null;
      return Math.round((target.getTime() - today.getTime()) / 86400000);
    }

    function daysUntilLabel(d) {
      if (d === null) return '';
      if (d < 0)  return `已过 ${-d} 天`;
      if (d === 0) return '今天';
      if (d === 1) return '明天';
      return `${d} 天后`;
    }

    function urgencyOf(d) {
      if (d === null) return { level: -1, cls: '' };
      if (d <= 0)  return { level: 3, cls: 'text-rose-700 bg-rose-50/80 border-rose-200/70' };
      if (d <= 1)  return { level: 2, cls: 'text-orange-700 bg-orange-50/80 border-orange-200/70' };
      if (d <= 7)  return { level: 1, cls: 'text-amber-700 bg-amber-50/80 border-amber-200/70' };
      return { level: 0, cls: 'text-slate-600 bg-white/60 border-slate-200/70' };
    }

    function appEvents(app) {
      const isClosed = ['已 Offer', '已挂'].includes(app.status);
      const events = [];
      const stale = (d) => d === null || d < -7;
      if (app.examDate) {
        const d = daysUntil(app.examDate);
        if (!stale(d) && !isClosed) events.push({ kind: 'exam', label: '笔试', date: app.examDate, days: d });
      }
      if (app.nextInterviewDate) {
        const d = daysUntil(app.nextInterviewDate);
        if (!stale(d) && !isClosed) events.push({ kind: 'interview', label: '面试', date: app.nextInterviewDate, days: d });
      }
      if (app.offerDeadline) {
        const d = daysUntil(app.offerDeadline);
        if (!stale(d) && app.status !== '已挂') events.push({ kind: 'offer', label: 'Offer 截止', date: app.offerDeadline, days: d });
      }
      return events;
    }

    const upcomingEvents = computed(() => {
      const list = [];
      applications.value.forEach(app => {
        appEvents(app).forEach(ev => {
          if (ev.days >= 0 && ev.days <= 7) list.push({ ...ev, app });
        });
      });
      return list.sort((a, b) => a.days - b.days);
    });

    // ════════════════════════════════════════
    // 日历视图
    // ════════════════════════════════════════
    const CAL_EVENT_TYPES = [
      { key: 'submit',    label: '投递',       icon: '🚀', color: '#4338ca', border: 'rgba(99, 102, 241, 0.20)', bg: 'rgba(99, 102, 241, 0.08)' },
      { key: 'exam',      label: '笔试',       icon: '📝', color: '#c2410c', border: 'rgba(249, 115, 22, 0.22)', bg: 'rgba(249, 115, 22, 0.08)' },
      { key: 'interview', label: '面试',       icon: '🎤', color: '#b45309', border: 'rgba(245, 158, 11, 0.24)', bg: 'rgba(245, 158, 11, 0.10)' },
      { key: 'offer',     label: 'Offer 截止', icon: '⏳', color: '#be123c', border: 'rgba(244, 63, 94, 0.22)',  bg: 'rgba(244, 63, 94, 0.08)' },
      { key: 'log',       label: '面经记录',   icon: '📋', color: '#6d28d9', border: 'rgba(139, 92, 246, 0.22)', bg: 'rgba(139, 92, 246, 0.08)' },
    ];
    const CAL_TYPE_MAP = Object.fromEntries(CAL_EVENT_TYPES.map(t => [t.key, t]));

    const calTypeOn = reactive({ submit: true, exam: true, interview: true, offer: true, log: true });
    function toggleCalType(key) { calTypeOn[key] = !calTypeOn[key]; }

    const calCursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const selectedCalDate = ref('');

    function calPrevMonth() {
      const d = calCursor.value;
      calCursor.value = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    }
    function calNextMonth() {
      const d = calCursor.value;
      calCursor.value = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    function calGoToday() {
      const t = new Date();
      calCursor.value = new Date(t.getFullYear(), t.getMonth(), 1);
      selectedCalDate.value = isoDate(t);
    }
    function selectCalDate(dateStr) {
      selectedCalDate.value = selectedCalDate.value === dateStr ? '' : dateStr;
    }

    function isoDate(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    const calMonthLabel = computed(() => {
      const d = calCursor.value;
      return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
    });

    const allCalendarEvents = computed(() => {
      const events = [];
      applications.value.forEach(app => {
        const base = { appId: app.id, company: app.companyName, position: app.position };
        const push = (typeKey, dateStr, extra = {}) => {
          if (!dateStr) return;
          const t = CAL_TYPE_MAP[typeKey];
          events.push({
            uid: `${app.id}-${typeKey}-${dateStr}-${extra.round || ''}`,
            type: typeKey,
            date: dateStr,
            label: t.label,
            icon: t.icon,
            color: t.color,
            borderColor: t.border,
            bgColor: t.bg,
            ...base, ...extra,
          });
        };
        push('submit',    app.applicationDate);
        push('exam',      app.examDate);
        push('interview', app.nextInterviewDate, { round: app.interviewRound });
        push('offer',     app.offerDeadline);
        (app.interviews || []).forEach(iv => {
          push('log', iv.date, { round: iv.round });
        });
      });
      return events;
    });

    const filteredCalendarEvents = computed(() =>
      allCalendarEvents.value.filter(e => calTypeOn[e.type])
    );

    const calEventsByDate = computed(() => {
      const map = new Map();
      filteredCalendarEvents.value.forEach(ev => {
        if (!map.has(ev.date)) map.set(ev.date, []);
        map.get(ev.date).push(ev);
      });
      const order = { submit: 0, exam: 1, interview: 2, offer: 3, log: 4 };
      map.forEach(arr => arr.sort((a, b) => (order[a.type] - order[b.type]) || a.company.localeCompare(b.company)));
      return map;
    });

    const calendarGrid = computed(() => {
      const cursor = calCursor.value;
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const firstOfMonth = new Date(year, month, 1);
      const offset = (firstOfMonth.getDay() + 6) % 7;
      const start = new Date(year, month, 1 - offset);
      const todayStr = isoDate(new Date());
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const dateStr = isoDate(d);
        const dow = (d.getDay() + 6) % 7;
        cells.push({
          dateStr,
          day: d.getDate(),
          inMonth: d.getMonth() === month,
          isToday: dateStr === todayStr,
          isWeekend: dow === 5 || dow === 6,
          events: calEventsByDate.value.get(dateStr) || [],
        });
      }
      return cells;
    });

    const calTypeCounts = computed(() => {
      const counts = { submit: 0, exam: 0, interview: 0, offer: 0, log: 0 };
      allCalendarEvents.value.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
      return counts;
    });

    const calEventTypes = computed(() => CAL_EVENT_TYPES);

    const calendarTodayCount = computed(() => {
      const todayStr = isoDate(new Date());
      return allCalendarEvents.value.filter(e => e.date === todayStr).length;
    });

    const calMonthEventCount = computed(() => {
      const d = calCursor.value;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const prefix = `${y}-${m}`;
      return filteredCalendarEvents.value.filter(e => e.date.startsWith(prefix)).length;
    });

    const calendarEventStats = computed(() => {
      const d = calCursor.value;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const prefix = `${y}-${m}`;
      return {
        total: allCalendarEvents.value.length,
        thisMonth: allCalendarEvents.value.filter(e => e.date.startsWith(prefix)).length,
      };
    });

    const selectedDayEvents = computed(() => {
      if (!selectedCalDate.value) return [];
      return calEventsByDate.value.get(selectedCalDate.value) || [];
    });

    const selectedCalDateLabel = computed(() => {
      if (!selectedCalDate.value) return '';
      const [y, m, day] = selectedCalDate.value.split('-').map(Number);
      const d = new Date(y, m - 1, day);
      const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
      const diff = daysUntil(selectedCalDate.value);
      const rel = diff === 0 ? '· 今天' : diff === 1 ? '· 明天' : diff === -1 ? '· 昨天' : '';
      return `${y} 年 ${m} 月 ${day} 日 · ${weekdays[d.getDay()]} ${rel}`.trim();
    });

    const calUpcoming = computed(() => {
      return filteredCalendarEvents.value
        .filter(e => {
          const diff = daysUntil(e.date);
          return diff !== null && diff >= 0 && diff <= 7;
        })
        .map(e => ({ ...e, daysAway: daysUntil(e.date) }))
        .sort((a, b) => a.daysAway - b.daysAway || a.date.localeCompare(b.date))
        .slice(0, 12);
    });

    // ── 浏览器通知（仍存 localStorage，浏览器级状态） ──
    const NOTIFY_LOG_KEY = 'jobtracker_notified_v1';

    function loadNotifyLog() {
      try { return JSON.parse(localStorage.getItem(NOTIFY_LOG_KEY) || '{}'); }
      catch { return {}; }
    }

    function saveNotifyLog(log) {
      try { localStorage.setItem(NOTIFY_LOG_KEY, JSON.stringify(log)); } catch {}
    }

    async function checkAndNotify() {
      if (typeof Notification === 'undefined') return;
      const due = [];
      applications.value.forEach(app => {
        appEvents(app).forEach(ev => {
          if (ev.days === 0 || ev.days === 1) due.push({ ...ev, app });
        });
      });
      if (due.length === 0) return;

      if (Notification.permission === 'denied') return;
      if (Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch { return; }
      }
      if (Notification.permission !== 'granted') return;

      const today = new Date().toISOString().slice(0, 10);
      const log = loadNotifyLog();
      due.forEach(ev => {
        const key = `${today}::${ev.app.id}::${ev.kind}::${ev.days}`;
        if (log[key]) return;
        const when = ev.days === 0 ? '今天' : '明天';
        const title = `${when} · ${ev.label}：${ev.app.companyName}`;
        const body  = `${ev.app.position}${ev.app.workCity ? ' · ' + ev.app.workCity : ''}（${ev.date}）`;
        try {
          const n = new Notification(title, { body, tag: key });
          n.onclick = () => {
            window.focus();
            window.location.hash = '#detail/' + ev.app.id;
            n.close();
          };
          log[key] = 1;
        } catch {}
      });
      const cutoff = Date.now() - 7 * 86400000;
      Object.keys(log).forEach(k => {
        const d = k.slice(0, 10);
        if (new Date(d + 'T00:00:00').getTime() < cutoff) delete log[k];
      });
      saveNotifyLog(log);
    }

    // ── 面经导出 ──
    function exportInterviews(app) {
      const sorted = [...app.interviews].sort((a, b) => b.date.localeCompare(a.date));
      if (sorted.length === 0) { alert('暂无面试记录可导出'); return; }
      const lines = [
        `公司：${app.companyName}`,
        `岗位：${app.position}`,
        `投递日期：${app.applicationDate}`,
        '',
      ];
      sorted.forEach(iv => {
        lines.push('━'.repeat(40));
        lines.push(`${iv.round || '面试'} | ${iv.date}`);
        if (iv.notes) lines.push(`备注：${iv.notes}`);
        lines.push('');
        iv.questions.forEach((q, i) => {
          lines.push(`Q${i + 1}. ${q.question || '（未填写题目）'}`);
          if (q.answer)    { lines.push('【我的回答】'); lines.push(q.answer); lines.push(''); }
          if (q.refAnswer) { lines.push('【参考答案】'); lines.push(q.refAnswer); lines.push(''); }
        });
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `面经-${app.companyName}-${app.position}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }

    const expandedCards = ref({});
    function toggleCardExpand(id) {
      expandedCards.value[id] = !expandedCards.value[id];
    }

    const selfTestMode = ref(false);
    const revealedAnswers = ref({});

    function toggleSelfTest() {
      selfTestMode.value = !selfTestMode.value;
      revealedAnswers.value = {};
    }

    function revealAnswer(qId) {
      revealedAnswers.value[qId] = true;
    }

    const currentApp = computed(() =>
      ['detail', 'review'].includes(page.value)
        ? (applications.value.find(a => a.id === routeId.value) || null)
        : null
    );

    const detailTab = ref('info');

    const jdHtml = computed(() => {
      const src = currentApp.value?.jdFormatted || '';
      return src ? marked.parse(src) : '';
    });

    const todayStr = () => new Date().toISOString().slice(0, 10);

    // ── AI JD 格式化 ──
    const jdFormatLoading = ref(false);
    const jdFormatError   = ref('');

    async function formatJDForm() {
      if (!hasAnyKey()) {
        alert('后端未配置 AI Key，请编辑 .env 后重启服务');
        return;
      }
      if (!form.jdRaw.trim()) return;
      jdFormatLoading.value = true;
      jdFormatError.value   = '';
      try {
        form.jdFormatted = await callTextAI(JD_FORMAT_PROMPT, JD_FORMAT_USER(form.jdRaw), 'jd_format');
      } catch (err) {
        jdFormatError.value = err.message || 'AI 格式化失败，请重试';
      } finally {
        jdFormatLoading.value = false;
      }
    }

    async function formatJD(appId) {
      const app = applications.value.find(a => a.id === appId);
      if (!app || !app.jdRaw.trim()) return;
      if (!hasAnyKey()) {
        alert('后端未配置 AI Key，请编辑 .env 后重启服务');
        return;
      }
      jdFormatLoading.value = true;
      jdFormatError.value   = '';
      try {
        app.jdFormatted = await callTextAI(JD_FORMAT_PROMPT, JD_FORMAT_USER(app.jdRaw), 'jd_format');
        app.updatedAt   = new Date().toISOString();
      } catch (err) {
        jdFormatError.value = err.message || 'AI 格式化失败，请重试';
      } finally {
        jdFormatLoading.value = false;
      }
    }

    const formJdHtml = computed(() =>
      form.jdFormatted ? marked.parse(form.jdFormatted) : ''
    );

    // ── JD 截图识别 ──
    const jdImageLoading  = ref(false);
    const jdImageError    = ref('');
    const jdImageInputRef = ref(null);

    async function handleJDImage(event) {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        jdImageError.value = '请上传图片文件（JPG、PNG、WEBP 等）';
        return;
      }
      if (!hasAnyKey()) {
        alert('后端未配置 AI Key，请编辑 .env 后重启服务');
        return;
      }
      jdImageLoading.value = true;
      jdImageError.value   = '';
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = e => resolve(e.target.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const text = await extractJDFromImage(base64, file.type);
        if (text) form.jdRaw = form.jdRaw ? form.jdRaw + '\n\n' + text : text;
      } catch (err) {
        jdImageError.value = err.message || '图片识别失败，请重试';
      } finally {
        jdImageLoading.value = false;
      }
    }

    // ── AI 面试建议分析 ──
    const aiAnalysisLoading = ref(false);
    const aiAnalysisError   = ref('');

    const AI_ANALYSIS_SYSTEM = '你是一位资深求职顾问，用中文回答，Markdown 格式输出。';
    const AI_ANALYSIS_USER = (jd, resume) =>
      `以下是候选人的简历和目标岗位的 JD。请分析：1）简历与 JD 的核心匹配点；2）潜在短板及准备方向；3）面试中应重点强调的 2-3 个亮点；4）根据 JD 推断可能被问到的问题方向。\n\n---\n### 简历\n${resume}\n\n### 职位描述（JD）\n${jd}`;

    // ── AI 公司研究 ──
    const COMPANY_RESEARCH_SYSTEM = '你是一名资深求职顾问，输出纯 Markdown，不加额外说明文字，不要使用代码块包裹。回答内容基于训练数据中的公开认知，不要编造未经证实的具体数据。如果对某家公司不熟悉，请按通用模板给出可填写的提纲框架。';
    const COMPANY_RESEARCH_USER = (company, position, jd) =>
      `请围绕「${company}」公司针对「${position}」岗位，输出一份面试准备用的公司研究 Markdown，严格使用以下二级标题结构，每段保持简洁（共 350-600 字）：

## 公司业务概览
（主营业务、商业模式、规模量级、所属赛道）

## 近期动态
（已知的近 1-2 年战略动作、产品发布、组织变化；若不确定请写「需自行查证」）

## 核心产品与技术栈
（与该岗位相关的产品线、技术栈或方法论关键词）

## 主要竞品
（列出 2-4 家，附一句对比）

## 企业文化与价值观
（如有公开 slogan 或风格特征则提及，否则给出常见的面试关切方向）

## 面试关注方向
（基于以上分析，推断面试官可能重点考察的 3-5 个方向）

${jd ? `参考职位描述：\n${jd.slice(0, 600)}` : ''}`;

    const companyResearchLoading = ref({});
    const companyResearchError   = ref({});

    const companyResearchHtml = computed(() => {
      const src = currentApp.value?.companyResearch || '';
      return src ? marked.parse(src) : '';
    });

    async function generateCompanyResearch(appId) {
      const app = applications.value.find(a => a.id === appId);
      if (!app) return;
      if (!hasAnyKey()) {
        alert('后端未配置 AI Key，请编辑 .env 后重启服务');
        return;
      }
      if (app.companyResearch && !confirm('将覆盖已有的公司研究，确认重新生成？')) return;
      companyResearchLoading.value[appId] = true;
      companyResearchError.value[appId]   = '';
      try {
        app.companyResearch = await callTextAI(
          COMPANY_RESEARCH_SYSTEM,
          COMPANY_RESEARCH_USER(app.companyName, app.position, app.jdFormatted || app.jdRaw || ''),
          'company_research'
        );
        app.companyResearchAt = new Date().toISOString();
        app.updatedAt = new Date().toISOString();
      } catch (err) {
        companyResearchError.value[appId] = err.message || 'AI 生成失败，请重试';
      } finally {
        companyResearchLoading.value[appId] = false;
      }
    }

    // ── AI 简历 × JD 匹配度评分 ──
    const matchScoreLoading = ref({});
    const matchScoreError   = ref({});

    const MATCH_SCORE_SYSTEM = '你是资深求职顾问，擅长评估候选人简历与岗位的匹配度。严格按用户要求的 JSON 结构输出，不要包含 markdown 代码块标记、不要包含任何解释性文字。';

    const MATCH_SCORE_USER = (jd, resume, position, company) => `请基于下方信息，评估候选人简历与岗位的匹配度。

### 目标岗位
${company} · ${position}

### 职位描述（JD）
${jd}

### 候选人简历
${resume}

请严格输出以下 JSON 结构（仅 JSON 本身，不要加任何前言/总结/代码块标记）：
{
  "score": 0-100 之间的整数,
  "summary": "用一句话总结匹配情况",
  "strengths": ["简历命中 JD 的匹配亮点 1", "亮点 2", "亮点 3"],
  "gaps": ["简历相对 JD 的差距/不足 1", "差距 2"],
  "recommendation": "面试准备方向的具体建议（1-2 句）"
}`;

    function parseMatchScore(raw) {
      let text = String(raw || '').trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
      }
      const first = text.indexOf('{');
      const last  = text.lastIndexOf('}');
      if (first >= 0 && last > first) text = text.slice(first, last + 1);
      const data = JSON.parse(text);
      const score = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
      return {
        score,
        summary:        String(data.summary || '').trim(),
        strengths:      Array.isArray(data.strengths) ? data.strengths.filter(Boolean).map(String) : [],
        gaps:           Array.isArray(data.gaps)      ? data.gaps.filter(Boolean).map(String)      : [],
        recommendation: String(data.recommendation || '').trim(),
      };
    }

    async function computeMatchScore(appId) {
      const app = applications.value.find(a => a.id === appId);
      if (!app) return;
      if (!hasAnyKey()) {
        alert('后端未配置 AI Key，请编辑 .env 后重启服务');
        return;
      }
      if (!app.jdFormatted && !app.jdRaw) {
        alert('请先填写 JD 内容');
        return;
      }
      const resume = resumeOf(app);
      if (!resume || !resume.text) {
        alert('请先在表单里关联一份简历，或前往设置页上传');
        return;
      }
      matchScoreLoading.value[appId] = true;
      matchScoreError.value[appId]   = '';
      try {
        const raw = await callTextAI(
          MATCH_SCORE_SYSTEM,
          MATCH_SCORE_USER(app.jdFormatted || app.jdRaw, resume.text, app.position, app.companyName),
          'match_score'
        );
        const parsed = parseMatchScore(raw);
        app.matchScore          = parsed.score;
        app.matchSummary        = parsed.summary;
        app.matchStrengths      = parsed.strengths;
        app.matchGaps           = parsed.gaps;
        app.matchRecommendation = parsed.recommendation;
        app.matchScoreAt        = new Date().toISOString();
        app.matchResumeId       = resume.id;
        app.updatedAt           = new Date().toISOString();
      } catch (err) {
        matchScoreError.value[appId] = err.message || 'AI 评估失败，请重试';
      } finally {
        matchScoreLoading.value[appId] = false;
      }
    }

    const aiAnalysisHtml = computed(() => {
      const src = currentApp.value?.aiAnalysis || '';
      return src ? marked.parse(src) : '';
    });

    function renderMd(text) {
      return text ? marked.parse(String(text)) : '';
    }

    async function analyzeWithAI(appId) {
      const app = applications.value.find(a => a.id === appId);
      if (!app) return;
      if (!hasAnyKey()) {
        alert('后端未配置 AI Key，请编辑 .env 后重启服务');
        return;
      }
      const jdText = app.jdFormatted || app.jdRaw;
      if (!jdText) {
        alert('请先填写 JD 内容');
        return;
      }
      const resume = resumeOf(app);
      if (!resume || !resume.text) {
        alert('请先关联一份简历（在表单或详情页的「简历匹配」卡片中选择）');
        return;
      }
      if (app.aiAnalysis && !confirm('将覆盖已有的分析结果，确认重新分析？')) return;
      aiAnalysisLoading.value = true;
      aiAnalysisError.value   = '';
      try {
        app.aiAnalysis = await callTextAI(
          AI_ANALYSIS_SYSTEM,
          AI_ANALYSIS_USER(jdText, resume.text),
          'interview_analysis'
        );
        app.updatedAt = new Date().toISOString();
      } catch (err) {
        aiAnalysisError.value = err.message || 'AI 分析失败，请重试';
      } finally {
        aiAnalysisLoading.value = false;
      }
    }

    // ── 任务 ──
    const newTaskContent = ref('');
    const newTaskDueAt   = ref('');

    function addTask(app) {
      if (!app) return;
      const content = newTaskContent.value.trim();
      if (!content) return;
      if (!Array.isArray(app.tasks)) app.tasks = [];
      app.tasks.push({
        id: crypto.randomUUID(),
        content,
        dueAt: newTaskDueAt.value || '',
        done: false,
        createdAt: new Date().toISOString(),
      });
      app.updatedAt = new Date().toISOString();
      newTaskContent.value = '';
      newTaskDueAt.value   = '';
    }

    function toggleTask(app, taskId) {
      if (!app || !Array.isArray(app.tasks)) return;
      const t = app.tasks.find(x => x.id === taskId);
      if (!t) return;
      t.done = !t.done;
      app.updatedAt = new Date().toISOString();
    }

    function removeTask(app, taskId) {
      if (!app || !Array.isArray(app.tasks)) return;
      app.tasks = app.tasks.filter(x => x.id !== taskId);
      app.updatedAt = new Date().toISOString();
    }

    function pendingCount(app) {
      if (!app || !Array.isArray(app.tasks)) return 0;
      return app.tasks.filter(t => !t.done).length;
    }

    function taskDueLabel(t) {
      if (!t.dueAt) return '';
      const d = daysUntil(t.dueAt);
      if (d === null) return '';
      if (d === 0) return '今天';
      if (d < 0) return `逾期 ${-d}d`;
      return `+${d}d`;
    }

    function taskDueClass(t) {
      if (!t.dueAt) return 'text-zinc-400 bg-zinc-50 border-zinc-200';
      if (t.done) return 'text-zinc-400 bg-zinc-50 border-zinc-200';
      const d = daysUntil(t.dueAt);
      if (d === null) return 'text-zinc-400 bg-zinc-50 border-zinc-200';
      if (d < 0) return 'text-rose-700 bg-rose-50 border-rose-200';
      if (d === 0) return 'text-amber-700 bg-amber-50 border-amber-200';
      if (d <= 3) return 'text-orange-700 bg-orange-50 border-orange-200';
      return 'text-slate-600 bg-slate-50 border-slate-200';
    }

    // ── 关键时间 ──
    function keyDateClass(days) {
      if (days === null) return 'text-slate-500 bg-slate-50/60 border-slate-200/70';
      if (days < 0)   return 'text-slate-500 bg-slate-50/80 border-slate-200/70';
      if (days === 0) return 'text-rose-700 bg-rose-50/80 border-rose-200/70';
      if (days === 1) return 'text-orange-700 bg-orange-50/80 border-orange-200/70';
      if (days <= 7)  return 'text-amber-700 bg-amber-50/80 border-amber-200/70';
      return 'text-slate-600 bg-white/60 border-slate-200/70';
    }

    const keyDateSlots = computed(() => {
      const app = currentApp.value;
      if (!app) return [];
      const make = (field, icon, label) => {
        const value = app[field] || '';
        const days  = value ? daysUntil(value) : null;
        return { field, icon, label, value, days, isSet: !!value, cls: keyDateClass(days) };
      };
      return [
        make('examDate',          '📝', '笔试时间'),
        make('nextInterviewDate', '🎤', '下次面试'),
        make('offerDeadline',     '⏳', 'Offer 截止'),
      ];
    });

    function updateKeyDate(field, value) {
      const app = currentApp.value;
      if (!app) return;
      app[field] = value || '';
      app.updatedAt = new Date().toISOString();
    }

    function openDatePicker(field, event) {
      if (event && event.target && event.target.closest('button')) return;
      const input = document.getElementById('keydate-' + field);
      if (!input) return;
      try {
        if (typeof input.showPicker === 'function') {
          input.showPicker();
          return;
        }
      } catch (e) {}
      input.focus();
    }

    const statusTimeline = computed(() => {
      const app = currentApp.value;
      if (!app || !Array.isArray(app.statusHistory) || app.statusHistory.length === 0) return [];
      return app.statusHistory.map((h, idx) => {
        const isFirst = idx === 0;
        const rawDate = isFirst && app.applicationDate ? app.applicationDate : (h.changedAt || '').slice(0, 10);
        const [, m, d] = rawDate.split('-');
        const label = h.round && h.status === '面试中' ? `${h.status} · ${h.round}` : h.status;
        return {
          status: h.status,
          round:  h.round || '',
          label,
          shortDate: m && d ? `${parseInt(m)}/${parseInt(d)}` : '',
          fullDate:  rawDate,
          changedAt: h.changedAt,
        };
      });
    });

    const pendingTodayTasks = computed(() => {
      const out = [];
      applications.value.forEach(app => {
        if (!Array.isArray(app.tasks)) return;
        app.tasks.forEach(t => {
          if (t.done) return;
          if (!t.dueAt) return;
          const d = daysUntil(t.dueAt);
          if (d === null) return;
          if (d <= 0) out.push({ ...t, app, daysLeft: d, overdue: d < 0 });
        });
      });
      out.sort((a, b) => a.daysLeft - b.daysLeft || a.app.companyName.localeCompare(b.app.companyName));
      return out;
    });

    // ── 表单 ──
    const form = reactive({
      companyName: '', position: '', applicationDate: todayStr(),
      status: '已投递待回复', interviewRound: '', workCity: '', companyBrief: '', notes: '',
      offerSalary: '', jdRaw: '', jdFormatted: '',
      examDate: '', nextInterviewDate: '', offerDeadline: '',
      resumeId: '',
    });
    const errors = reactive({ companyName: '', position: '' });

    function resetForm() {
      Object.assign(form, {
        companyName: '', position: '', applicationDate: todayStr(),
        status: '已投递待回复', interviewRound: '', workCity: '', companyBrief: '', notes: '',
        offerSalary: '', jdRaw: '', jdFormatted: '',
        examDate: '', nextInterviewDate: '', offerDeadline: '',
        resumeId: settings.value.defaultResumeId || '',
      });
      errors.companyName = ''; errors.position = '';
      jdFormatError.value = '';
    }

    function loadFormFromApp(app) {
      Object.assign(form, {
        companyName: app.companyName, position: app.position,
        applicationDate: app.applicationDate, status: app.status,
        interviewRound: app.interviewRound || '', companyBrief: app.companyBrief || '',
        workCity: app.workCity || '', notes: app.notes || '', offerSalary: app.offerSalary || '',
        jdRaw: app.jdRaw || '', jdFormatted: app.jdFormatted || '',
        examDate: app.examDate || '',
        nextInterviewDate: app.nextInterviewDate || '',
        offerDeadline: app.offerDeadline || '',
        resumeId: app.resumeId || '',
      });
      errors.companyName = ''; errors.position = '';
      jdFormatError.value = '';
    }

    function validateForm() {
      errors.companyName = form.companyName.trim() ? '' : '请填写公司名';
      errors.position   = form.position.trim()    ? '' : '请填写岗位名称';
      return !errors.companyName && !errors.position;
    }

    async function saveApp() {
      if (!validateForm()) return;
      const now = new Date().toISOString();
      const data = {
        companyName:       form.companyName.trim(),
        position:          form.position.trim(),
        applicationDate:   form.applicationDate,
        status:            form.status,
        interviewRound:    form.status === '面试中' ? form.interviewRound : '',
        companyBrief:      form.companyBrief,
        workCity:          form.workCity,
        notes:             form.notes,
        offerSalary:       form.status === '已 Offer' ? form.offerSalary : '',
        jdRaw:             form.jdRaw,
        jdFormatted:       form.jdFormatted,
        examDate:          form.examDate || '',
        nextInterviewDate: form.nextInterviewDate || '',
        offerDeadline:     form.offerDeadline || '',
        resumeId:          form.resumeId || '',
        updatedAt:         now,
      };
      if (page.value === 'add') {
        const newApp = {
          id: crypto.randomUUID(),
          ...data,
          aiAnalysis: '',
          interviews: [],
          tasks: [],
          createdAt: now,
          statusHistory: [{
            status: data.status,
            round: data.interviewRound || '',
            changedAt: now,
          }],
        };
        try {
          const created = await JobTrackerAPI.applications.create(newApp);
          suppressWatch = true;
          applications.value.unshift(created);
          lastSentByAppId.set(created.id, serializeApp(created));
          queueMicrotask(() => { suppressWatch = false; });
          window.location.hash = '#list';
        } catch (e) {
          alert('保存失败：' + e.message);
        }
      } else {
        const app = applications.value.find(a => a.id === routeId.value);
        if (app) {
          const prevStatus = app.status;
          const prevRound  = app.interviewRound || '';
          Object.assign(app, data);
          if (app.status !== prevStatus || (app.interviewRound || '') !== prevRound) {
            if (!Array.isArray(app.statusHistory)) app.statusHistory = [];
            app.statusHistory.push({
              status: app.status,
              round: app.interviewRound || '',
              changedAt: now
            });
          }
        }
        // 立即触发 flush（不等 debounce）
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        await flushDirty();
        window.location.hash = '#detail/' + routeId.value;
      }
    }

    async function deleteApp() {
      const app = applications.value.find(a => a.id === routeId.value);
      const label = app ? `「${app.companyName} · ${app.position}」` : '此记录';
      if (!confirm(`确认删除 ${label}？此操作不可撤销。`)) return;
      try {
        await JobTrackerAPI.applications.remove(routeId.value);
        suppressWatch = true;
        applications.value = applications.value.filter(a => a.id !== routeId.value);
        lastSentByAppId.delete(routeId.value);
        dirtySet.delete(routeId.value);
        queueMicrotask(() => { suppressWatch = false; });
        window.location.hash = '#list';
      } catch (e) {
        alert('删除失败：' + e.message);
      }
    }

    // ── 测试 AI 连接（按 provider 维度） ──
    const aiTestLoading = ref({});   // { providerKey: bool } 或 { _global: bool }
    const aiTestResult = ref({});    // { providerKey: string }

    async function testAIConnection(providerKey) {
      const key = providerKey || '_global';
      aiTestLoading.value = { ...aiTestLoading.value, [key]: true };
      aiTestResult.value = { ...aiTestResult.value, [key]: '' };
      try {
        // 临时改 routing：把 connection_test 指向被测 provider；测完不持久化
        // 简化做法：直接通过传入 purpose='connection_test' 让后端走当前 routing；
        // 想指定 provider 时改为在前端先把 routing 临时切换，但更稳妥是后端支持 override。
        // 这里走最简单路径：保存当前 routing[connection_test] → 临时改 → 调 → 恢复
        let restore = null;
        if (providerKey) {
          const current = settings.value.aiRouting?.connection_test || 'deepseek';
          if (current !== providerKey) {
            await JobTrackerAPI.settings.update({
              aiRouting: { ...settings.value.aiRouting, connection_test: providerKey }
            });
            restore = current;
          }
        }
        const data = await JobTrackerAPI.ai.text({
          system: '你是一个简洁的助手',
          user: '请回复"OK"',
          purpose: 'connection_test'
        });
        const msg = `✓ ${data.provider}${data.fallback ? ' (降级)' : ''}：${(data.content || '').slice(0, 30)}`;
        aiTestResult.value = { ...aiTestResult.value, [key]: msg };
        if (restore !== null) {
          await JobTrackerAPI.settings.update({
            aiRouting: { ...settings.value.aiRouting, connection_test: restore }
          });
        }
      } catch (e) {
        aiTestResult.value = { ...aiTestResult.value, [key]: '✗ 失败：' + e.message };
      } finally {
        aiTestLoading.value = { ...aiTestLoading.value, [key]: false };
      }
    }

    // ── AI provider 配置：保存到后端 ──
    const aiConfigSaveLoading = ref({});   // { providerKey: bool }
    const aiConfigSaveResult = ref({});

    // 前端编辑中的本地草稿（仅 apiKey 单独管理，其他字段直接绑 settings.aiProviders[pk]）
    const aiKeyDrafts = reactive({ deepseek: '', qwen: '', openai: '', anthropic: '' });
    const aiKeyShow = reactive({ deepseek: false, qwen: false, openai: false, anthropic: false });

    async function saveProviderConfig(providerKey) {
      aiConfigSaveLoading.value = { ...aiConfigSaveLoading.value, [providerKey]: true };
      aiConfigSaveResult.value = { ...aiConfigSaveResult.value, [providerKey]: '' };
      try {
        const local = settings.value.aiProviders[providerKey] || {};
        const payload = {
          aiProviders: {
            [providerKey]: {
              baseUrl: local.baseUrl || '',
              textModel: local.textModel || '',
              visionModel: local.visionModel || ''
            }
          }
        };
        // 仅当草稿非空字符串时才发送 apiKey；空字符串表示用户想清除 Key
        const draft = aiKeyDrafts[providerKey];
        if (draft !== undefined && draft !== null) {
          if (draft === '__CLEAR__') {
            payload.aiProviders[providerKey].apiKey = '';
          } else if (draft !== '') {
            payload.aiProviders[providerKey].apiKey = draft;
          }
        }
        const updated = await JobTrackerAPI.settings.update(payload);
        // 用后端响应回写状态
        settings.value.aiProviders = updated.aiProviders || {};
        settings.value.hasDeepseekKey = Boolean(updated.hasDeepseekKey);
        settings.value.hasQwenKey = Boolean(updated.hasQwenKey);
        settings.value.hasOpenaiKey = Boolean(updated.hasOpenaiKey);
        settings.value.hasAnthropicKey = Boolean(updated.hasAnthropicKey);
        aiKeyDrafts[providerKey] = '';   // 清草稿
        aiConfigSaveResult.value = { ...aiConfigSaveResult.value, [providerKey]: '✓ 已保存' };
        setTimeout(() => {
          aiConfigSaveResult.value = { ...aiConfigSaveResult.value, [providerKey]: '' };
        }, 2000);
      } catch (e) {
        aiConfigSaveResult.value = { ...aiConfigSaveResult.value, [providerKey]: '✗ ' + e.message };
      } finally {
        aiConfigSaveLoading.value = { ...aiConfigSaveLoading.value, [providerKey]: false };
      }
    }

    function clearProviderKey(providerKey) {
      if (!confirm(`确认清除 ${providerKey} 的 API Key？AI 功能将无法使用此服务商。`)) return;
      aiKeyDrafts[providerKey] = '__CLEAR__';
      saveProviderConfig(providerKey);
    }

    function resetProviderDefaults(providerKey) {
      const meta = settings.value.aiProviderMeta[providerKey];
      if (!meta) return;
      if (!settings.value.aiProviders[providerKey]) {
        settings.value.aiProviders[providerKey] = {};
      }
      settings.value.aiProviders[providerKey].baseUrl = meta.defaultBaseUrl;
      settings.value.aiProviders[providerKey].textModel = meta.defaultTextModel;
      settings.value.aiProviders[providerKey].visionModel = meta.defaultVisionModel;
    }

    // ── AI 功能路由：单条变更立即保存 ──
    async function updateRouting(purposeKey, providerKey) {
      const old = settings.value.aiRouting[purposeKey];
      settings.value.aiRouting = { ...settings.value.aiRouting, [purposeKey]: providerKey };
      try {
        await JobTrackerAPI.settings.update({ aiRouting: settings.value.aiRouting });
      } catch (e) {
        // 回滚
        settings.value.aiRouting = { ...settings.value.aiRouting, [purposeKey]: old };
        alert('保存路由失败：' + e.message);
      }
    }

    // ── 路由变化时初始化 ──
    watch([page, routeId], ([newPage, newId]) => {
      if (newPage === 'add') resetForm();
      else if (newPage === 'edit') {
        const app = applications.value.find(a => a.id === newId);
        app ? loadFormFromApp(app) : (window.location.hash = '#list');
      } else if (newPage === 'detail') {
        detailTab.value = 'info';
        cancelInterview();
      } else if (newPage === 'review') {
        selfTestMode.value = false;
        revealedAnswers.value = {};
      }
      if (newPage === 'list') checkAndNotify();
    });

    onMounted(async () => {
      window.addEventListener('hashchange', parseRoute);
      parseRoute();
      try {
        await reloadAll();
        // 检测旧版 localStorage 数据
        const n = hasLegacyLocalData();
        if (n > 0 && applications.value.length === 0) {
          migrationCount.value = n;
          migrationOpen.value = true;
        }
        loading.value = false;
        setTimeout(checkAndNotify, 800);
      } catch (e) {
        loadError.value = e.message || '初始化失败，请检查后端是否运行';
        loading.value = false;
      }
    });

    return {
      loading, loadError,
      page, routeId, navClass, goDetail,
      applications, settings,
      hasAnyKey,
      // 迁移
      migrationOpen, migrationCount, migrationLoading, migrationError,
      performMigration, dismissMigration, manualMigrateFromLocalStorage,
      // 导入导出
      exportData, triggerImport, handleImportFile, importInputRef,
      // 筛选
      filterStatus, filterRound, searchQuery, allStatuses, filteredApplications,
      kanbanColumns, offerApps, archivedApps, offerCount, archivedCount,
      statusBadgeClass, statusDotClass, expandedCards, toggleCardExpand,
      // 徽章 picker
      activeBadgePicker, pickerStatus, customRoundInput, popoverStyle, roundPickerOptions: ROUND_PICKER_OPTIONS,
      openBadgePicker, closeBadgePicker, selectStatus, selectRound, submitCustomRound,
      pickerOfferSalary, selectOfferSalary, submitOfferSalary,
      draggingId, draggingFromStatus, dragOverColKey,
      handleDragStart, handleDragOver, handleDragLeave, handleDragEnd, handleDrop,
      // 详情
      currentApp, detailTab, jdHtml,
      jdFormatLoading, jdFormatError, formatJDForm, formatJD, formJdHtml,
      aiAnalysisLoading, aiAnalysisError, aiAnalysisHtml, analyzeWithAI, renderMd,
      statusStats, isStale, exportInterviews,
      daysUntil, daysUntilLabel, urgencyOf, appEvents, upcomingEvents,
      // 日历
      calCursor, calMonthLabel, calendarGrid, calendarTodayCount,
      selectedCalDate, selectedDayEvents, selectedCalDateLabel,
      calPrevMonth, calNextMonth, calGoToday, selectCalDate,
      calEventTypes, calTypeOn, toggleCalType, calTypeCounts,
      calMonthEventCount, calendarEventStats, calUpcoming,
      // 面经
      selfTestMode, revealedAnswers, toggleSelfTest, revealAnswer,
      jdImageLoading, jdImageError, jdImageInputRef, handleJDImage,
      sortedInterviews, interviewFormOpen, editingInterviewId, iForm,
      openAddInterview, openEditInterview, cancelInterview, saveInterview, deleteInterview,
      addQuestion, removeQuestion, interviewRounds: INTERVIEW_ROUNDS,
      aiRefLoadingMap, generateRefAnswer,
      // 简历
      resumeInputRef, resumeLoading, resumeError,
      handleResumeFile,
      editingResumeId, manualResumeText, manualResumeName,
      addResume, removeResume, setDefaultResume, updateResumeLabel, addManualResume,
      resumeOf, defaultResume,
      // 匹配评分
      matchScoreLoading, matchScoreError, computeMatchScore,
      // 自定义状态
      newCustomStatus, addCustomStatus, removeCustomStatus,
      // 表单
      form, errors, saveApp, deleteApp,
      addTestRecord,
      // 关键时间
      keyDateSlots, updateKeyDate, openDatePicker,
      statusTimeline,
      // 任务
      newTaskContent, newTaskDueAt,
      addTask, toggleTask, removeTask,
      pendingCount, pendingTodayTasks, taskDueLabel, taskDueClass,
      // 公司研究
      companyResearchLoading, companyResearchError, companyResearchHtml,
      generateCompanyResearch,
      // AI 测试
      aiTestLoading, aiTestResult, testAIConnection,
      // AI 模型配置
      aiKeyDrafts, aiKeyShow,
      aiConfigSaveLoading, aiConfigSaveResult,
      saveProviderConfig, clearProviderKey, resetProviderDefaults,
      updateRouting,
    };
  }
}).mount('#app');
