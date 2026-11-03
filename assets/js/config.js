/* ==========================================================================
 * config.js — 全局配置中心（民间借贷利息计算器）
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

APP.SITE = {
  name: '民间借贷利息计算器',
  domain: 'https://pyldiyishuai.github.io/private-lending-calc',
  contactEmail: 'hello@example.com',
  icp: '',
  beian: '',
  year: 2025
};

APP.DEBUG = { enabled: false, noDebounce: false };

APP.ADS = {
  enabled: false,
  provider: '',
  slots: {
    resultInline: { id: '', format: 'fluid', label: 'result-inline' },
    contentBanner: { id: '', format: 'horizontal', label: 'content-banner' },
    leadBox: { id: '', format: 'fluid', label: 'lead-box' }
  },
  afterCalcDelay: 600,
  refreshOnRecalc: false
};

APP.ANALYTICS = {
  enabled: false,
  provider: '',
  id: '',
  debug: false,
  events: { pageView: 'page_view', calcRun: 'calc_run', leadClick: 'lead_click' }
};

APP.API = {
  enabled: false,
  baseUrl: '',
  timeout: 8000,
  endpoints: {
    lpr: '/api/lpr',
    saveCase: '/api/case',
    feedback: '/api/feedback',
    leadSubmit: '/api/lead'
  }
};

APP.AUTH = {
  enabled: false,
  provider: '',
  loginUrl: '/login',
  storageKey: 'lending_auth_token'
};

APP.FEATURES = {
  // ---- 已实现 ----
  lprLookup: true,        // 按借款日查当时 LPR
  fourTimesCap: true,     // 四倍上限判定
  oldRule: true,          // 2020-08-20 前适用 24%/36% 旧规
  headFee: true,          // 砍头息从本金中扣除
  zoneSplit: true,        // 受保护 / 不受保护区段拆分
  overpaid: true,         // 多付部分可主张返还
  compound: true,         // 单利 / 复利

  // ---- 预留 ----
  lprChart: false,        // LPR 走势图
  installmentPlan: false, // 分期还款明细表
  penalty: false,         // 违约金与罚息合并计算
  crossPeriod: false,     // 跨 2020-08-20 分段计算
  evidenceCheck: false,   // 证据清单自检
  suitFeeCalc: false,     // 诉讼费计算
  exportReport: false,
  lawyerLead: false,      // 律师线索 ★ 核心变现
  cloudSave: false,
  i18n: false
};

APP.CONST = {
  MAX_AMOUNT: 100000000,
  MAX_RATE: 200,
  MONEY_DECIMALS: 2,
  STORAGE_PREFIX: 'lending_',
  ANIM_DURATION: 660
};
