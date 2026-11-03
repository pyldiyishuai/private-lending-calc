/* ==========================================================================
 * core/lending.js — 民间借贷利息计算（纯函数层）
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

APP.Core = APP.Core || {};

(function (Core) {
  'use strict';

  function n(v) {
    var x = Number(v);
    return isFinite(x) ? x : 0;
  }
  function r2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }
  function rules() { return APP.DATA || {}; }

  /* ======================================================================
   * 一、按日期查 LPR
   * ==================================================================== */

  /** 返回 date 当天有效的一年期 LPR（%） */
  function lprAt(dateStr) {
    var history = rules().lprHistory || [];
    var target = String(dateStr || '').slice(0, 10);
    if (!target) return history.length ? history[history.length - 1].rate : 3.45;

    var hit = history[0] ? history[0].rate : 3.45;
    for (var i = 0; i < history.length; i++) {
      if (history[i].date <= target) hit = history[i].rate;
      else break;
    }
    return hit;
  }

  /** 四倍上限（小数，如 0.138） */
  function capAt(dateStr) {
    return lprAt(dateStr) / 100 * 4;
  }

  /** 是否适用新规（2020-08-20 起） */
  function isNewRule(dateStr) {
    return String(dateStr || '') >= (rules().lprReformDate || '2020-08-20');
  }

  /* ======================================================================
   * 二、主计算
   * ==================================================================== */

  /**
   * @param {Object} f
   *  f.principal    借条上的本金
   *  f.headFee      砍头息 / 前置费用（从本金里扣走）
   *  f.rate         约定年利率（%）
   *  f.startDate    借款日（YYYY-MM-DD）
   *  f.endDate      结算日（YYYY-MM-DD）
   *  f.paid         已支付总额（可为 0）
   *  f.method       'simple' 单利 / 'compound' 复利
   */
  function buildResult(f) {
    var principalBook = Math.max(n(f.principal), 0);
    var headFee = Math.max(n(f.headFee), 0);

    // 实际本金：砍头息不计入本金
    var principal = Math.max(principalBook - headFee, 0);
    if (principal <= 0 && principalBook > 0) principal = principalBook;

    var rate = Math.max(n(f.rate), 0) / 100;
    var startDate = String(f.startDate || '').slice(0, 10) || '2023-01-01';
    var endDate = String(f.endDate || '').slice(0, 10) || todayStr();
    var paid = Math.max(n(f.paid), 0);
    var method = f.method === 'compound' ? 'compound' : 'simple';

    var days = diffDays(startDate, endDate);
    var years = days / 365;

    // ---- 利率上限 ----
    var lpr = lprAt(startDate);
    var cap = capAt(startDate);
    var newRule = isNewRule(startDate);
    var capLabel = newRule
      ? 'LPR ' + lpr.toFixed(2) + '% × 4 = ' + (cap * 100).toFixed(2) + '%'
      : '24%（旧规两线三区）';

    var effectiveCap = newRule ? cap : (rules().oldRules || {}).protect || 0.24;

    // ---- 利息计算 ----
    var agreedInterest = method === 'compound'
      ? principal * (Math.pow(1 + rate, years) - 1)
      : principal * rate * years;

    // 合法利息：取约定利率与上限的较小值——约定利率没超标时，
    // 合法利息就等于约定利息，不能按上限封顶去算
    var cappedRate = Math.min(rate, effectiveCap);
    var legalInterest = method === 'compound'
      ? principal * (Math.pow(1 + cappedRate, years) - 1)
      : principal * cappedRate * years;

    var isOverCap = rate > effectiveCap + 1e-9;
    var excessRate = isOverCap ? rate - effectiveCap : 0;
    var excessInterest = Math.max(agreedInterest - legalInterest, 0);

    // ---- 应还总额 ----
    var payableLegal = r2(principal + legalInterest);
    var payableAgreed = r2(principal + agreedInterest);
    var remainingLegal = r2(Math.max(payableLegal - paid, 0));
    var remainingAgreed = r2(Math.max(payableAgreed - paid, 0));

    // 已付超过法定应还的部分，可以主张返还/冲抵本金
    var overpaid = r2(Math.max(paid - payableLegal, 0));

    // ---- 分档 ----
    var zones = buildZones(rate, effectiveCap, principal, years, method, newRule);

    // ---- 砍头息的影响 ----
    var headFeeEffect = null;
    if (headFee > 0) {
      var withHead = principalBook * rate * years;         // 按账面本金算的利息
      var withoutHead = principal * rate * years;          // 按实际本金算
      headFeeEffect = {
        book: r2(principalBook),
        actual: r2(principal),
        saved: r2(withHead - withoutHead),
        rateOnBook: principalBook > 0 ? (headFee / principalBook) : 0
      };
    }

    return {
      valid: principalBook > 0 && days > 0,
      input: {
        principalBook: r2(principalBook), headFee: r2(headFee),
        principal: r2(principal), rate: rate * 100,
        startDate: startDate, endDate: endDate, paid: r2(paid), method: method
      },
      period: {
        days: days,
        years: r2(years),
        start: startDate,
        end: endDate
      },
      lpr: {
        rate: lpr,
        cap: cap,
        effectiveCap: effectiveCap,
        label: capLabel,
        newRule: newRule,
        reformDate: rules().lprReformDate
      },
      interest: {
        agreed: r2(agreedInterest),
        legal: r2(legalInterest),
        excess: r2(excessInterest),
        excessRate: r2(excessRate * 100),
        isOverCap: isOverCap
      },
      payable: {
        legal: payableLegal,
        agreed: payableAgreed,
        remainingLegal: remainingLegal,
        remainingAgreed: remainingAgreed,
        paid: r2(paid),
        overpaid: overpaid
      },
      headFee: headFeeEffect,
      zones: zones,
      tips: buildTips(isOverCap, excessInterest, overpaid, headFee, newRule, effectiveCap, paid)
    };
  }

  /* ======================================================================
   * 三、利率区间划分
   * ==================================================================== */

  function buildZones(rate, cap, principal, years, method, newRule) {
    var zones = [];
    var calc = function (r) {
      return method === 'compound'
        ? principal * (Math.pow(1 + r, years) - 1)
        : principal * r * years;
    };

    if (newRule) {
      zones.push({
        key: 'legal',
        label: '受保护区间',
        range: '0 – ' + (cap * 100).toFixed(2) + '%',
        amount: r2(calc(Math.min(rate, cap))),
        tone: 'good',
        note: '四倍 LPR 以内，法院全额支持'
      });
      if (rate > cap) {
        zones.push({
          key: 'excess',
          label: '不受保护',
          range: (cap * 100).toFixed(2) + '% – ' + (rate * 100).toFixed(2) + '%',
          amount: r2(calc(rate) - calc(cap)),
          tone: 'bad',
          note: '超过四倍 LPR，这部分利息法院不支持'
        });
      }
    } else {
      // 旧规：两线三区
      var protect = 0.24, natural = 0.36;
      zones.push({
        key: 'protect',
        label: '完全保护',
        range: '0 – 24%',
        amount: r2(calc(Math.min(rate, protect))),
        tone: 'good',
        note: '24% 以内，法院全额支持'
      });
      if (rate > protect) {
        zones.push({
          key: 'natural',
          label: '自然债务区',
          range: '24% – ' + Math.min(rate * 100, 36).toFixed(0) + '%',
          amount: r2(calc(Math.min(rate, natural)) - calc(protect)),
          tone: 'warn',
          note: '已支付的不退，未支付的不支持'
        });
      }
      if (rate > natural) {
        zones.push({
          key: 'invalid',
          label: '无效区间',
          range: '36% – ' + (rate * 100).toFixed(2) + '%',
          amount: r2(calc(rate) - calc(natural)),
          tone: 'bad',
          note: '超过 36%，已支付的可以要求返还'
        });
      }
    }
    return zones;
  }

  /* ======================================================================
   * 四、提示
   * ==================================================================== */

  function buildTips(isOverCap, excess, overpaid, headFee, newRule, cap, paid) {
    var out = [];
    var notes = rules().notes || {};

    if (isOverCap && excess > 0) {
      out.push({
        type: 'warn',
        text: '约定的利率<b>超过了法定上限</b>。按 ' + (cap * 100).toFixed(2) + '% 计算，' +
              '多出来的 <b>' + Math.round(excess).toLocaleString('zh-CN') + ' 元利息不受法律保护</b>，' +
              '你可以拒绝支付这部分。'
      });
    } else {
      out.push({
        type: 'ok',
        text: '约定利率在上限以内，这部分利息法院会全额支持。' +
              '作为出借人，你的主张有法律依据。'
      });
    }

    if (overpaid > 0) {
      out.push({
        type: 'warn',
        text: '你已支付的钱<b>超过了按法定上限计算的应还总额</b>，' +
              '多付了 <b>' + Math.round(overpaid).toLocaleString('zh-CN') + ' 元</b>。' +
              '这部分可以主张冲抵本金，或要求出借人返还。'
      });
    }

    if (headFee > 0) {
      out.push({
        type: 'tip',
        text: '砍头息已从本金中扣除。《民法典》第 670 条：利息不得预先在本金中扣除，' +
              '应当按<b>实际借款数额</b>返还并计算利息。'
      });
    }

    if (newRule) {
      out.push({ type: 'info', text: notes.lpr });
    } else {
      out.push({ type: 'info', text: notes.reform });
    }

    out.push({ type: 'info', text: notes.allFees });

    return out;
  }

  /* ======================================================================
   * 五、工具函数与扩展
   * ==================================================================== */

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function diffDays(a, b) {
    var t1 = Date.parse(a + 'T00:00:00');
    var t2 = Date.parse(b + 'T00:00:00');
    if (!isFinite(t1) || !isFinite(t2)) return 0;
    return Math.max(Math.round((t2 - t1) / 86400000), 0);
  }

  /** 给定利率反查：本金多少年的利息等于某金额（用于「利息滚成本金」场景） */
  function yearsToDouble(rate) {
    var r = Math.max(n(rate), 0.0001);
    return Math.log(2) / Math.log(1 + r);
  }

  /** LPR 历史表（供页面展示） */
  function lprTable() {
    return (rules().lprHistory || []).slice().reverse().map(function (item) {
      return {
        date: item.date,
        rate: item.rate,
        cap: r2(item.rate * 4)
      };
    });
  }

  /** 跨期分段计算（旧规 → 新规） */
  function splitPeriod(f) {
    var reform = (rules().lprReformDate) || '2020-08-20';
    var start = String(f.startDate || '');
    var end = String(f.endDate || '');
    if (!start || !end || start >= reform) return null;

    var a = buildResult(Object.assign({}, f, { startDate: start, endDate: reform }));
    var b = buildResult(Object.assign({}, f, {
      startDate: reform, endDate: end,
      principal: f.principal - (f.headFee || 0)
    }));
    return {
      oldPart: { days: a.period.days, legal: a.interest.legal },
      newPart: { days: b.period.days, legal: b.interest.legal },
      totalLegal: r2(a.interest.legal + b.interest.legal)
    };
  }

  Core.Lending = {
    buildResult: buildResult,
    lprAt: lprAt,
    capAt: capAt,
    isNewRule: isNewRule,
    diffDays: diffDays,
    lprTable: lprTable,
    splitPeriod: splitPeriod,
    yearsToDouble: yearsToDouble
  };
})(APP.Core);
