/* ==========================================================================
 * integrations/analytics.js — 埋点层
 * --------------------------------------------------------------------------
 * 目标：只暴露 APP.Analytics.track(event, props)。
 * 内部按配置同时投递到 GA4 / 百度统计 / 自建端点，全部失败也不影响业务。
 *
 * 【为什么要有这层】
 * 做工具站最值钱的数据是「用户输入了什么参数、选了哪个方案」。
 * 这些数据决定你下一步做什么功能、卖给谁广告。
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

(function () {
  'use strict';

  var CFG = APP.ANALYTICS || {};
  var queue = [];       // 未加载完成时先缓存
  var loaded = false;

  /* ======================================================================
   * 一、SDK 加载
   * ==================================================================== */

  function loadGA4() {
    if (!CFG.ga4 || CFG.ga4.indexOf('XXXX') > -1) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + CFG.ga4;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', CFG.ga4, { send_page_view: false });
  }

  function loadBaidu() {
    if (!CFG.baiduHmt || CFG.baiduHmt.indexOf('xxx') > -1) return;
    window._hmt = window._hmt || [];
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://hm.baidu.com/hm.js?' + CFG.baiduHmt;
    document.head.appendChild(s);
  }

  function ensureLoaded() {
    if (loaded) return;
    loadGA4();
    loadBaidu();
    loaded = true;
    // 补发缓存事件
    queue.splice(0).forEach(function (item) { send(item.name, item.props); });
  }

  /* ======================================================================
   * 二、投递
   * ==================================================================== */

  function send(name, props) {
    props = props || {};

    // GA4
    if (window.gtag && CFG.ga4) {
      try { window.gtag('event', name, props); } catch (e) {}
    }

    // 百度统计（只支持 _trackEvent 三参数）
    if (window._hmt && CFG.baiduHmt) {
      try {
        window._hmt.push(['_trackEvent', props.category || 'tool',
                          name, props.label || JSON.stringify(props).slice(0, 120)]);
      } catch (e) {}
    }

    // 自建端点（可选，方便自己建报表）
    if (CFG.endpoint) {
      try {
        var body = JSON.stringify({ event: name, props: props, ts: Date.now(), url: location.href });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(CFG.endpoint, body);
        } else {
          fetch(CFG.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
            keepalive: true
          }).catch(function () {});
        }
      } catch (e) {}
    }

    if (APP.DEBUG && APP.DEBUG.verbose) {
      console.log('[Analytics]', name, props);
    }
  }

  /* ======================================================================
   * 三、对外 API
   * ==================================================================== */

  function track(name, props) {
    if (!CFG.enabled) return;
    if (!loaded) {
      queue.push({ name: name, props: props });
      ensureLoaded();
      return;
    }
    send(name, props);
  }

  /** 页面浏览（SPA 路由切换时手动调用） */
  function pageView(page) {
    track((CFG.events && CFG.events.pageView) || 'page_view', {
      page: page || location.pathname
    });
  }

  /**
   * 测算事件 —— 这是本工具最重要的埋点
   * 记录用户输入的参数分布，用于：
   *   - 判断真实用户画像（贷款规模、利率区间）
   *   - 优化默认值（默认值越贴合主流，转化越高）
   *   - 给广告主报数据
   */
  /**
   * 测算事件 —— 本工具最重要的埋点
   * 记录借款规模、约定利率、是否超标、是否含砍头息，
   * 用于判断用户是出借人还是借款人、以及线索质量。
   */
  function trackCalc(result) {
    if (!result) return;
    track((CFG.events && CFG.events.calcRun) || 'calc_run', {
      category: 'calc',
      principal_bucket: amountBucket(result.input.principal),
      rate: result.input.rate,
      over_cap: result.interest.isOverCap,
      cap: r2pct(result.lpr.effectiveCap),
      new_rule: result.lpr.newRule,
      has_head_fee: result.input.headFee > 0,
      has_paid: result.payable.paid > 0,
      method: result.input.method,
      excess_bucket: amountBucket(result.interest.excess),
      overpaid: result.payable.overpaid > 0
    });
  }

  function r2pct(v) { return Math.round(Number(v) * 10000) / 100; }

  function amountBucket(v) {
    var x = Number(v) || 0;
    if (x <= 0) return '0';
    if (x < 10000) return '<1w';
    if (x < 50000) return '1-5w';
    if (x < 100000) return '5-10w';
    if (x < 500000) return '10-50w';
    if (x < 1000000) return '50-100w';
    return '>100w';
  }

  /** 金额分桶：不报精确值，保护隐私也让报表更好看 */
  function bucket(v) {
    if (v < 200000) return '<20w';
    if (v < 500000) return '20-50w';
    if (v < 1000000) return '50-100w';
    if (v < 2000000) return '100-200w';
    if (v < 5000000) return '200-500w';
    return '>500w';
  }

  /* ---------- 初始化 ---------- */
  ensureLoaded();

  /* ---------- 导出 ---------- */
  APP.Analytics = {
    track: track,
    pageView: pageView,
    trackCalc: trackCalc,
    amountBucket: amountBucket
  };
})();
