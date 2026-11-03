/* ==========================================================================
 * ui/form.js — 表单读写（民间借贷版）
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

APP.UI = APP.UI || {};

(function (UI) {
  'use strict';

  var FIELDS = {
    principal: { min: 0, max: 100000000, money: true },
    headFee:   { min: 0, max: 100000000, money: true },
    rate:      { min: 0, max: 200 },
    paid:      { min: 0, max: 100000000, money: true }
  };

  var DEFAULTS = {
    principal: 100000,
    headFee: 5000,
    rate: 24,
    paid: 30000
  };

  function stripMoney(s) { return String(s == null ? '' : s).replace(/[^\d.]/g, ''); }

  function groupThousands(s) {
    if (s === '' || s == null) return '';
    var parts = String(s).split('.');
    var intPart = parts[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.length > 1 ? intPart + '.' + parts[1].slice(0, 2) : intPart;
  }

  function readNum(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var v = parseFloat(String(el.value == null ? '' : el.value).replace(/[,，\s]/g, ''));
    return isFinite(v) ? v : 0;
  }

  function clamp(v, cfg) {
    if (!isFinite(v)) return cfg.min || 0;
    return Math.min(Math.max(v, cfg.min), cfg.max);
  }

  function getValues() {
    var v = {};
    Object.keys(FIELDS).forEach(function (id) {
      v[id] = clamp(readNum(id), FIELDS[id]);
    });
    var s = document.getElementById('startDate');
    var e = document.getElementById('endDate');
    v.startDate = s ? s.value : '';
    v.endDate = e ? e.value : '';
    var m = document.getElementById('method');
    v.method = m ? m.value : 'simple';
    return v;
  }

  function setValue(id, value, silent) {
    var el = document.getElementById(id);
    if (!el) return;
    var cfg = FIELDS[id] || {};
    if (cfg.money) el.value = groupThousands(String(Math.round(Number(value) || 0)));
    else el.value = String(Number(value) || 0);
    if (!silent) updateHints();
  }

  function formatMoneyInput(el) {
    var caretFromEnd = el.value.length - (el.selectionStart || 0);
    var formatted = groupThousands(stripMoney(el.value));
    if (formatted === el.value) return;
    el.value = formatted;
    var pos = Math.max(formatted.length - caretFromEnd, 0);
    try { el.setSelectionRange(pos, pos); } catch (e) {}
  }

  function updateHints() {
    var v = getValues();
    var F = UI.Format;
    var L = APP.Core.Lending;

    var actual = Math.max(v.principal - v.headFee, 0);
    if (actual <= 0 && v.principal > 0) actual = v.principal;

    var headTip = document.getElementById('headTip');
    if (headTip) {
      if (v.headFee > 0) {
        headTip.innerHTML = '实际本金 <b>' + F.moneyFree(actual, 0) + '</b>' +
          '（账面 ' + F.moneyFree(v.principal, 0) + ' − 前置费用 ' + F.moneyFree(v.headFee, 0) + '）';
        headTip.style.color = 'var(--accent)';
      } else {
        headTip.textContent = '没有砍头息就填 0';
        headTip.style.color = '';
      }
    }

    var rateTip = document.getElementById('rateTip');
    if (rateTip && v.startDate) {
      var lpr = L.lprAt(v.startDate);
      var cap = L.capAt(v.startDate) * 100;
      var isNew = L.isNewRule(v.startDate);
      var over = v.rate > cap + 1e-9;
      if (isNew) {
        rateTip.innerHTML = '借款日 LPR <b>' + lpr.toFixed(2) + '%</b>，四倍上限 <b>' +
          cap.toFixed(2) + '%</b>' +
          (over ? ' · <span style="color:var(--danger)">你填的利率已超标</span>' : ' · 未超标');
        rateTip.style.color = over ? 'var(--danger)' : '';
      } else {
        rateTip.innerHTML = '借款日在 2020-08-20 之前，适用旧规 <b>24% / 36%</b> 两线三区';
        rateTip.style.color = '';
      }
    }

    var periodTip = document.getElementById('periodTip');
    if (periodTip) {
      var days = L.diffDays(v.startDate, v.endDate);
      periodTip.textContent = days > 0
        ? '共 ' + days + ' 天，约 ' + (days / 365).toFixed(2) + ' 年'
        : '请填写借款日与结算日';
    }
  }

  function bind(onChange) {
    Object.keys(FIELDS).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var cfg = FIELDS[id];
      el.addEventListener('input', function () {
        if (cfg.money) formatMoneyInput(el);
        updateHints();
        onChange();
      });
      el.addEventListener('blur', function () {
        setValue(id, clamp(readNum(id), cfg));
        onChange();
      });
    });

    ['startDate', 'endDate', 'method'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () { updateHints(); onChange(); });
      el.addEventListener('input', function () { updateHints(); onChange(); });
    });

    // 快捷期限
    document.querySelectorAll('[data-quick-months]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var months = Number(btn.dataset.quickMonths);
        var s = document.getElementById('startDate');
        if (!s || !s.value) return;
        var d = new Date(s.value + 'T00:00:00');
        d.setMonth(d.getMonth() + months);
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        var e = document.getElementById('endDate');
        if (e) e.value = y + '-' + m + '-' + day;
        document.querySelectorAll('[data-quick-months]').forEach(function (b) {
          b.classList.toggle('is-on', b === btn);
        });
        updateHints();
        onChange();
      });
    });

    // 快捷利率
    document.querySelectorAll('[data-quick-rate]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setValue('rate', btn.dataset.quickRate);
        document.querySelectorAll('[data-quick-rate]').forEach(function (b) {
          b.classList.toggle('is-on', b === btn);
        });
        onChange();
      });
    });
  }

  function reset() {
    Object.keys(DEFAULTS).forEach(function (id) { setValue(id, DEFAULTS[id]); });
    var s = document.getElementById('startDate');
    if (s) s.value = '2023-01-01';
    var e = document.getElementById('endDate');
    if (e) e.value = '2024-01-01';
    var m = document.getElementById('method');
    if (m) m.value = 'simple';
    updateHints();
  }

  function init() {
    Object.keys(DEFAULTS).forEach(function (id) { setValue(id, DEFAULTS[id], true); });
    var s = document.getElementById('startDate');
    if (s && !s.value) s.value = '2023-01-01';
    var e = document.getElementById('endDate');
    if (e && !e.value) e.value = '2024-01-01';
    updateHints();
  }

  UI.Form = {
    init: init, getValues: getValues, setValue: setValue, reset: reset, bind: bind,
    updateHints: updateHints, groupThousands: groupThousands,
    FIELDS: FIELDS, DEFAULTS: DEFAULTS
  };
})(APP.UI);
