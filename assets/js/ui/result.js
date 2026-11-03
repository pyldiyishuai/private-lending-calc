/* ==========================================================================
 * ui/result.js — 结果渲染（民间借贷）
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

APP.UI = APP.UI || {};

(function (UI) {
  'use strict';

  var F = null;
  function fmt() { if (!F) F = UI.Format; return F; }

  var animRaf = {};
  function animateValue(el, from, to, formatter, duration) {
    if (!el) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !isFinite(from) || !isFinite(to)) { el.textContent = formatter(to); return; }
    var id = el.id || (el.id = 'v' + Math.random().toString(36).slice(2));
    if (animRaf[id]) cancelAnimationFrame(animRaf[id]);
    var start = performance.now(), dur = duration || 660, delta = to - from;
    function step(now) {
      var t = Math.min((now - start) / dur, 1);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = formatter(from + delta * e);
      if (t < 1) animRaf[id] = requestAnimationFrame(step);
      else animRaf[id] = null;
    }
    animRaf[id] = requestAnimationFrame(step);
  }

  var prevLegal = 0;

  function renderAll(r) {
    var f = fmt();
    renderHero(r, f);
    renderZones(r, f);
    renderDetail(r, f);
    renderHeadFee(r, f);
    renderTips(r.tips);

    var stamp = document.getElementById('resultStamp');
    if (stamp) {
      stamp.textContent = '已更新 ' + new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit'
      });
      stamp.classList.add('is-fresh');
      setTimeout(function () { stamp.classList.remove('is-fresh'); }, 1400);
    }
    setText('dockSave', f.num(r.payable.remainingLegal / 10000, 2));
  }

  function renderHero(r, f) {
    animateValue(document.getElementById('heroValue'), prevLegal, r.payable.remainingLegal,
      function (v) { return f.num(v / 10000, 2); }, 760);
    prevLegal = r.payable.remainingLegal;

    var sub = document.getElementById('heroSub');
    if (sub) {
      sub.innerHTML = '本金 <b>' + f.moneyFree(r.input.principal, 0) + '</b> + ' +
        '合法利息 <b>' + f.moneyFree(r.interest.legal, 0) + '</b>' +
        (r.payable.paid > 0 ? ' − 已付 <b>' + f.moneyFree(r.payable.paid, 0) + '</b>' : '');
    }

    var badge = document.getElementById('capBadge');
    if (badge) {
      if (!r.lpr.newRule) {
        badge.textContent = '旧规 24%';
        badge.className = 'result__level result__level--old';
      } else if (r.interest.isOverCap) {
        badge.textContent = '利率超标';
        badge.className = 'result__level result__level--bad';
      } else {
        badge.textContent = '利率合法';
        badge.className = 'result__level result__level--ok';
      }
    }
  }

  /* ---------- 利率区间条 ---------- */
  function renderZones(r, f) {
    var box = document.getElementById('zoneBox');
    if (!box) return;

    var total = r.zones.reduce(function (s, z) { return s + z.amount; }, 0) || 1;

    box.innerHTML = r.zones.map(function (z) {
      var pct = Math.max((z.amount / total) * 100, 0);
      return '<div class="zone zone--' + z.tone + '">' +
        '<div class="zone__bar"><span style="width:' + pct.toFixed(1) + '%"></span></div>' +
        '<div class="zone__body">' +
          '<div class="zone__head">' +
            '<b class="zone__label">' + z.label + '</b>' +
            '<span class="zone__range">' + z.range + '</span>' +
          '</div>' +
          '<div class="zone__amount">' + f.moneyFree(z.amount, 0) + '</div>' +
          '<p class="zone__note">' + z.note + '</p>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ---------- 明细 ---------- */
  function renderDetail(r, f) {
    var body = document.getElementById('detailBody');
    if (!body) return;

    var rows = [
      {
        name: '借款本金（账面）',
        detail: '借条 / 合同上写的金额',
        amount: r.input.principalBook,
        zero: r.input.principalBook <= 0
      },
      {
        name: '砍头息 / 前置费用',
        detail: '预先从本金中扣除，依法不计入本金',
        amount: -r.input.headFee,
        zero: r.input.headFee <= 0,
        negative: true
      },
      {
        name: '实际借款本金',
        detail: '按实际到手金额计算，是算利息的基数',
        amount: r.input.principal,
        zero: r.input.principal <= 0,
        key: true
      },
      {
        name: '计息天数',
        detail: r.period.start + ' → ' + r.period.end,
        text: r.period.days + ' 天（' + r.period.years + ' 年）'
      },
      {
        name: '约定年利率',
        detail: r.input.method === 'compound' ? '按复利计算' : '按单利计算',
        text: r.input.rate.toFixed(2) + '%'
      },
      {
        name: '法定上限',
        detail: r.lpr.label,
        text: (r.lpr.effectiveCap * 100).toFixed(2) + '%'
      },
      {
        name: '约定利息',
        detail: '按合同约定算出来的利息',
        amount: r.interest.agreed,
        zero: r.interest.agreed <= 0
      },
      {
        name: '合法利息',
        detail: '按法定上限算，法院会支持的部分',
        amount: r.interest.legal,
        zero: r.interest.legal <= 0,
        key: true
      },
      {
        name: '不受保护的利息',
        detail: '超过上限的部分，可以拒绝支付',
        amount: r.interest.excess,
        zero: r.interest.excess <= 0,
        danger: r.interest.excess > 0
      },
      {
        name: '已支付',
        detail: '已经转给出借人的全部款项',
        amount: -r.payable.paid,
        zero: r.payable.paid <= 0,
        negative: true
      }
    ];

    body.innerHTML = rows.map(function (row) {
      var val;
      if (row.text !== undefined) val = '<span class="detail-text">' + row.text + '</span>';
      else if (row.zero) val = '—';
      else if (row.negative) val = '−' + f.moneyFree(Math.abs(row.amount), 0);
      else val = f.moneyFree(row.amount, 0);

      var cls = (row.zero ? 'is-zero ' : '') + (row.key ? 'is-key ' : '') + (row.danger ? 'is-danger ' : '');
      return '<tr class="' + cls + '">' +
        '<td class="detail-name">' + row.name +
          '<span class="detail-sub">' + row.detail + '</span>' +
        '</td>' +
        '<td class="detail-amount">' + val + '</td>' +
      '</tr>';
    }).join('') +
    '<tr class="is-total">' +
      '<td>按法定上限应还</td>' +
      '<td>' + f.moneyFree(r.payable.legal, 0) + '</td>' +
    '</tr>' +
    (r.payable.remainingLegal > 0
      ? '<tr class="is-remain"><td>扣除已付后剩余</td><td>' +
        f.moneyFree(r.payable.remainingLegal, 0) + '</td></tr>'
      : '<tr class="is-remain"><td>已付清，多付部分可主张返还</td><td>' +
        f.moneyFree(r.payable.overpaid, 0) + '</td></tr>');

    var altEl = document.getElementById('agreedTotal');
    if (altEl) {
      altEl.innerHTML = '如果按约定利率 ' + r.input.rate.toFixed(2) + '% 算，' +
        '应还 <b>' + f.moneyFree(r.payable.agreed, 0) + '</b>' +
        (r.interest.excess > 0
          ? '，比法定上限多 <b class="is-danger-text">' +
            f.moneyFree(r.interest.excess, 0) + '</b>'
          : '，与法定上限一致');
    }
  }

  /* ---------- 砍头息影响 ---------- */
  function renderHeadFee(r, f) {
    var box = document.getElementById('headBox');
    if (!box) return;
    if (!r.headFee) {
      box.innerHTML = '<div class="head-empty">没有砍头息。' +
        '如果出借人在放款时预先扣了利息或费用，填进去会显著降低本金基数。</div>';
      return;
    }
    var h = r.headFee;
    box.innerHTML =
      '<div class="head-row">' +
        '<span>账面本金</span><b>' + f.moneyFree(h.book, 0) + '</b>' +
      '</div>' +
      '<div class="head-row is-key">' +
        '<span>实际本金（法律认可）</span><b>' + f.moneyFree(h.actual, 0) + '</b>' +
      '</div>' +
      '<div class="head-row is-save">' +
        '<span>少算的利息</span><b>' + f.moneyFree(h.saved, 0) + '</b>' +
      '</div>' +
      '<p class="head-note">砍掉的 ' + f.moneyFree(h.book - h.actual, 0) +
        ' 占账面本金的 <b>' + (h.rateOnBook * 100).toFixed(1) + '%</b>。' +
        '这部分不仅不算本金，还相当于把实际利率抬高了一截。</p>';
  }

  /* ---------- 提示 ---------- */
  function renderTips(list) {
    var textEl = document.getElementById('adviceText');
    var box = document.getElementById('advice');
    if (!textEl) return;
    if (!list || !list.length) { if (box) box.style.display = 'none'; return; }
    if (box) box.style.display = '';
    textEl.innerHTML = list.map(function (item, i) {
      var cls = 'advice__item advice__item--' + (item.type || 'info');
      if (i === 0) cls += ' advice__lead';
      return '<span class="' + cls + '">' + item.text + '</span>';
    }).join('');
  }

  /* ---------- 陷阱 ---------- */
  function renderTraps() {
    var box = document.getElementById('trapList');
    var list = (APP.DATA && APP.DATA.traps) || [];
    if (!box) return;
    box.innerHTML = list.map(function (t, i) {
      return '<div class="trap__item">' +
        '<span class="trap__num">' + (i + 1) + '</span>' +
        '<div class="trap__body">' +
          '<h3 class="trap__title">' + t.title + '</h3>' +
          '<p class="trap__text">' + t.text + '</p>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ---------- LPR 表 ---------- */
  function renderLprTable() {
    var body = document.getElementById('lprBody');
    if (!body) return;
    var rows = APP.Core.Lending.lprTable();
    body.innerHTML = rows.map(function (row) {
      return '<tr>' +
        '<td>' + row.date + '</td>' +
        '<td>' + row.rate.toFixed(2) + '%</td>' +
        '<td>' + row.cap.toFixed(2) + '%</td>' +
      '</tr>';
    }).join('');
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  UI.Result = {
    renderAll: renderAll,
    renderTraps: renderTraps,
    renderLprTable: renderLprTable
  };
})(APP.UI);
