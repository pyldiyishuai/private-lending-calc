/* ==========================================================================
 * tests/smoke.js — 民间借贷利息计算器冒烟测试
 * ========================================================================== */

(async function () {
  var out = { total: 0, passed: 0, failed: 0, failures: [] };

  function ok(name, cond, got) {
    out.total++;
    if (cond) out.passed++;
    else { out.failed++; out.failures.push(name + '  →  got: ' + JSON.stringify(got)); }
  }
  function eq(name, got, want) {
    ok(name, String(got) === String(want), got + ' (want ' + want + ')');
  }
  function near(name, got, want, tol) {
    ok(name, Math.abs(Number(got) - Number(want)) <= (tol == null ? 0.6 : tol),
       got + ' (want ' + want + ')');
  }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var L = APP.Core.Lending;

  function base(over) {
    var f = {
      principal: 100000, headFee: 5000, rate: 24,
      startDate: '2023-01-01', endDate: '2024-01-01',
      paid: 30000, method: 'simple'
    };
    Object.keys(over || {}).forEach(function (k) { f[k] = over[k]; });
    return f;
  }

  /* ==================================================================
   * 一、LPR 查询
   * ================================================================== */

  eq('2019-08-20 的 LPR', L.lprAt('2019-08-20'), 4.25);
  eq('2020-04-20 起 3.85', L.lprAt('2020-05-01'), 3.85);
  eq('2022-08-22 起 3.65', L.lprAt('2023-01-01'), 3.65);
  eq('2023-08-21 起 3.45', L.lprAt('2023-12-31'), 3.45);
  eq('2024-10-21 起 3.10', L.lprAt('2025-01-01'), 3.10);
  eq('2025-05-20 起 3.00', L.lprAt('2025-06-01'), 3.00);
  eq('早于第一条记录时取第一条', L.lprAt('2019-01-01'), 4.25);
  eq('晚于最后一条时取最后一条', L.lprAt('2030-01-01'), 3.00);
  eq('日期为空时取最后一条', L.lprAt(''), 3.00);

  near('3.65% 的四倍 = 14.60%', L.capAt('2023-01-01') * 100, 14.6, 0.001);
  near('3.00% 的四倍 = 12.00%', L.capAt('2025-06-01') * 100, 12.0, 0.001);

  eq('2020-08-19 适用旧规', L.isNewRule('2020-08-19'), false);
  eq('2020-08-20 起适用新规', L.isNewRule('2020-08-20'), true);
  eq('2023 年适用新规', L.isNewRule('2023-01-01'), true);

  /* ==================================================================
   * 二、天数
   * ================================================================== */

  eq('2023-01-01 → 2024-01-01 = 365 天', L.diffDays('2023-01-01', '2024-01-01'), 365);
  eq('同一天 = 0', L.diffDays('2023-01-01', '2023-01-01'), 0);
  eq('倒序返回 0', L.diffDays('2024-01-01', '2023-01-01'), 0);
  eq('半年约 182 天', L.diffDays('2023-01-01', '2023-07-02'), 182);

  /* ==================================================================
   * 三、主计算：10 万 / 砍 5 千 / 24% / 一年 / 已付 3 万
   * ================================================================== */

  var r = L.buildResult(base());

  eq('实际本金 = 100000 − 5000 = 95,000', r.input.principal, 95000);
  eq('账面本金保留', r.input.principalBook, 100000);
  eq('计息天数 365', r.period.days, 365);
  eq('LPR 3.65%', r.lpr.rate, 3.65);
  near('上限 14.60%', r.lpr.effectiveCap * 100, 14.6, 0.001);
  eq('适用新规', r.lpr.newRule, true);

  eq('约定利息 = 95000 × 24% = 22,800', r.interest.agreed, 22800);
  eq('合法利息 = 95000 × 14.6% = 13,870', r.interest.legal, 13870);
  eq('不受保护 = 22,800 − 13,870 = 8,930', r.interest.excess, 8930);
  eq('判定为超标', r.interest.isOverCap, true);

  eq('按法定上限应还 = 95000 + 13870 = 108,870', r.payable.legal, 108870);
  eq('按约定应还 = 95000 + 22800 = 117,800', r.payable.agreed, 117800);
  eq('扣除已付 3 万后剩余 78,870', r.payable.remainingLegal, 78870);
  eq('未多付', r.payable.overpaid, 0);

  eq('区间拆 2 段', r.zones.length, 2);
  eq('受保护段 13,870', r.zones[0].amount, 13870);
  eq('不受保护段 8,930', r.zones[1].amount, 8930);
  eq('受保护段 tone 为 good', r.zones[0].tone, 'good');
  eq('不受保护段 tone 为 bad', r.zones[1].tone, 'bad');

  near('砍头息少算的利息 = 100000×24% − 95000×24% = 1,200',
       r.headFee.saved, 1200, 0.6);
  eq('砍头息占账面 5%', r.headFee.rateOnBook, 0.05);

  /* ==================================================================
   * 四、利率不超标
   * ================================================================== */

  var rOk = L.buildResult(base({ rate: 12 }));
  eq('12% 未超标', rOk.interest.isOverCap, false);
  eq('12% 无不受保护利息', rOk.interest.excess, 0);
  eq('12% 约定利息 = 95000 × 12% = 11,400', rOk.interest.agreed, 11400);
  eq('12% 合法利息 = 约定利息', rOk.interest.legal, 11400);
  eq('未超标只有 1 段区间', rOk.zones.length, 1);

  /* ==================================================================
   * 五、旧规（2020-08-20 之前）
   * ================================================================== */

  var rOld = L.buildResult(base({ startDate: '2019-09-01', endDate: '2020-09-01', rate: 30 }));
  eq('旧规标记', rOld.lpr.newRule, false);
  near('旧规上限 24%', rOld.lpr.effectiveCap * 100, 24, 0.001);
  eq('30% 落在 24–36% 之间，拆 2 段', rOld.zones.length, 2);
  eq('旧规第一段 完全保护', rOld.zones[0].label, '完全保护');
  eq('旧规第二段 自然债务区', rOld.zones[1].label, '自然债务区');

  var rOld40 = L.buildResult(base({ startDate: '2019-09-01', endDate: '2020-09-01', rate: 40 }));
  eq('40% 超过 36%，拆 3 段', rOld40.zones.length, 3);
  eq('第三段 无效区间', rOld40.zones[2].label, '无效区间');

  var r24 = L.buildResult(base({ startDate: '2019-09-01', endDate: '2020-09-01', rate: 24 }));
  eq('旧规 24% 只有 1 段', r24.zones.length, 1);
  eq('旧规 24% 未超标', r24.interest.isOverCap, false);

  /* ==================================================================
   * 六、多付返还
   * ================================================================== */

  var rOver = L.buildResult(base({ paid: 120000 }));
  eq('已付 12 万 > 应还 108,870', rOver.payable.overpaid, 11130);
  eq('剩余为 0', rOver.payable.remainingLegal, 0);

  var rPaidOff = L.buildResult(base({ paid: 150000 }));
  eq('多付 41,130', rPaidOff.payable.overpaid, 41130);

  /* ==================================================================
   * 七、复利
   * ================================================================== */

  var rC = L.buildResult(base({ method: 'compound', rate: 12 }));
  var wantC = 95000 * (Math.pow(1.12, 1) - 1);
  near('复利 12% 一年 = 本金 × 12%', rC.interest.agreed, wantC, 0.6);
  eq('复利标记', rC.input.method, 'compound');

  var rC3 = L.buildResult(base({ method: 'compound', rate: 12, endDate: '2026-01-01' }));
  // 三年含闰年，实际是 3.0027 年，按实际年数算期望值
  var y3 = rC3.period.days / 365;
  var wantC3 = 95000 * (Math.pow(1.12, y3) - 1);
  near('复利 12% 三年约 38,510', rC3.interest.agreed, wantC3, 1);
  ok('复利三年利息高于单利三年',
     rC3.interest.agreed > L.buildResult(base({ rate: 12, endDate: '2026-01-01' })).interest.agreed,
     rC3.interest.agreed);

  /* ==================================================================
   * 八、无砍头息
   * ================================================================== */

  var rNoHead = L.buildResult(base({ headFee: 0 }));
  eq('无砍头息时本金 = 账面', rNoHead.input.principal, 100000);
  eq('无砍头息 headFee 为 null', rNoHead.headFee, null);
  eq('无砍头息约定利息 = 100000 × 24% = 24,000', rNoHead.interest.agreed, 24000);

  /* ==================================================================
   * 九、边界
   * ================================================================== */

  var rNeg = L.buildResult({ principal: -100, headFee: -50, rate: -5,
    startDate: '2023-01-01', endDate: '2024-01-01', paid: -1000 });
  eq('负本金钳制为 0', rNeg.input.principalBook, 0);
  eq('负砍头息钳制为 0', rNeg.input.headFee, 0);
  eq('负利率钳制为 0', rNeg.input.rate, 0);
  eq('负已付钳制为 0', rNeg.payable.paid, 0);
  eq('无效输入 valid 为 false', rNeg.valid, false);

  var rHeadOver = L.buildResult(base({ principal: 10000, headFee: 20000 }));
  ok('砍头息大于本金时不死循环', rHeadOver.input.principal > 0, rHeadOver.input.principal);

  var rSame = L.buildResult(base({ endDate: '2023-01-01' }));
  eq('同日结算 days 为 0', rSame.period.days, 0);
  eq('同日结算利息为 0', rSame.interest.agreed, 0);
  eq('同日结算 valid 为 false', rSame.valid, false);

  /* ==================================================================
   * 十、DOM
   * ================================================================== */

  eq('主数字 7.89', $('heroValue').textContent, '7.89');
  eq('徽章显示利率超标', $('capBadge').textContent, '利率超标');
  eq('区间渲染 2 段', document.querySelectorAll('#zoneBox .zone').length, 2);
  ok('明细表有实际本金 95,000',
     $('detailBody').textContent.indexOf('95,000') > -1,
     $('detailBody').textContent.slice(0, 120));
  ok('砍头息框有内容', $('headBox').textContent.indexOf('95,000') > -1, '');
  eq('LPR 表 12 行', document.querySelectorAll('#lprBody tr').length, 12);
  eq('陷阱 6 条', document.querySelectorAll('#trapList .trap__item').length, 6);
  eq('FAQ 12 条', document.querySelectorAll('#faqList .faq__item').length, 12);

  var ld = Array.prototype.slice.call(document.querySelectorAll('script[type="application/ld+json"]'));
  ok('注入 FAQPage', ld.some(function (s) { return s.textContent.indexOf('FAQPage') > -1; }), ld.length);

  /* ==================================================================
   * 十一、交互
   * ================================================================== */

  // 11.1 点 12% 快捷利率
  var btn12 = document.querySelector('[data-quick-rate="12"]');
  btn12.click();
  await sleep(700);
  eq('点 12% 后输入框为 12', $('rate').value, '12');
  eq('不超标时徽章变为「利率合法」', $('capBadge').textContent, '利率合法');
  eq('不超标时区间只剩 1 段', document.querySelectorAll('#zoneBox .zone').length, 1);

  // 11.2 点「三年」快捷期限
  var btn3y = document.querySelector('[data-quick-months="36"]');
  btn3y.click();
  await sleep(700);
  ok('结算日变成了 2026 年', $('endDate').value.indexOf('2026') === 0, $('endDate').value);

  // 11.3 回到 24%
  var btn24 = document.querySelector('[data-quick-rate="24"]');
  btn24.click();
  await sleep(700);
  ok('回到 24% 后又超标', $('capBadge').textContent === '利率超标', $('capBadge').textContent);

  // 11.4 切旧规日期
  $('startDate').value = '2019-09-01';
  $('endDate').value = '2020-09-01';
  $('startDate').dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(700);
  eq('旧规徽章', $('capBadge').textContent, '旧规 24%');

  /* ==================================================================
   * 十二、提示
   * ================================================================== */

  var tipsOver = r.tips.map(function (t) { return t.text; }).join('');
  ok('超标提示提到不受保护', tipsOver.indexOf('不受法律保护') > -1, tipsOver.slice(0, 60));
  ok('提示包含砍头息说明', tipsOver.indexOf('670') > -1, '');

  var tipsOk = rOk.tips.map(function (t) { return t.text; }).join('');
  ok('未超标提示为正面', tipsOk.indexOf('全额支持') > -1, tipsOk.slice(0, 60));

  var tipsOld = rOld.tips.map(function (t) { return t.text; }).join('');
  ok('旧规提示提到 2020', tipsOld.indexOf('2020') > -1, '');

  /* ==================================================================
   * 十三、扩展函数
   * ================================================================== */

  near('12% 复利下 6.12 年翻倍', L.yearsToDouble(0.12), 6.12, 0.05);

  var sp = L.splitPeriod(base({ startDate: '2019-06-01', endDate: '2021-06-01' }));
  ok('跨期案件返回分段', sp !== null && sp.oldPart.days > 0 && sp.newPart.days > 0,
     sp ? sp.oldPart.days + '/' + sp.newPart.days : 'null');
  var spSame = L.splitPeriod(base({ startDate: '2023-01-01', endDate: '2024-01-01' }));
  eq('全在新规期不返回分段', spSame, null);

  return out;
})()
