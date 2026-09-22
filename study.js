/* 生命花园 · 研究 1 网页版 · study.js
   会话由网址参数 session= 决定：d0（第一天）、d1（第二天）、fu（一个月回访）。
   数据经 DataPipe 存到 OSF：每个会话一份 JSON；D+1 的花园提交后立即单独上传一份。
*/
(function () {
  const CFG = window.LG_CONFIG;
  const qs = new URLSearchParams(location.search);
  const SESSION = (window.LG_SESSION || qs.get('session') || 'd0').toLowerCase();
  const PLATFORM = (window.LG_PLATFORM || qs.get('platform') || CFG.PLATFORM || 'credamo').toLowerCase();
  const TXT = CFG.PLATFORM_TEXT[PLATFORM] || CFG.PLATFORM_TEXT.credamo;
  // 连接码 / 完成码：5 位随机 + 2 位完成小时 + 1 位校验，字母表去掉易混字符（无 0/O/1/I）
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const EPOCH = Date.UTC(2026, 8, 1); // 2026-09-01
  const hoursNow = () => Math.floor((Date.now() - EPOCH) / 3.6e6);
  const rand5 = () => { const a = new Uint32Array(5); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.floor(Math.random() * 4e9)); return Array.from(a, x => ALPHA[x % 32]).join(''); };
  const checkChar = (s7) => ALPHA[[...s7].reduce((acc, ch, i) => acc + ALPHA.indexOf(ch) * (i + 1), 0) % 32];
  const makeCode = (r5, hours) => { const h = ((hours % 1024) + 1024) % 1024; const s7 = r5 + ALPHA[Math.floor(h / 32)] + ALPHA[h % 32]; return s7 + checkChar(s7); };
  const parseCode = (raw) => { const c = (raw || '').toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I'); if (c.length !== 8 || [...c].some(ch => ALPHA.indexOf(ch) < 0)) return { ok: false, reason: 'format' }; if (checkChar(c.slice(0, 7)) !== c[7]) return { ok: false, reason: 'check' }; const hours = ALPHA.indexOf(c[5]) * 32 + ALPHA.indexOf(c[6]); return { ok: true, code: c, hours }; };
  const fmt = (c) => c.slice(0, 4) + '-' + c.slice(4);
  let PAIR = null; // 本会话使用的连接码
  const RETURN_URL = qs.get(CFG.RETURN_PARAM);
  let PID = null;
  for (const k of CFG.PID_PARAMS) { if (qs.get(k)) { PID = qs.get(k); break; } }
  if (!PID) { PID = 'anon-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  const LS = (k) => `lg_${PID}_${k}`;
  const nowISO = () => new Date().toISOString();
  const store = {}; // 本会话的所有记录
  const log = (tag, obj) => { store[tag] = Object.assign({ t: nowISO() }, obj || {}); };
  const evt = []; const ev = (name, extra) => evt.push(Object.assign({ name, t: nowISO() }, extra || {}));
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; };
  const code = (kind) => { if (kind === 'd0' && PAIR) return fmt(PAIR); if ((kind === 'd1' || kind === 'fu') && PAIR) return CFG.CODE_PREFIX[kind] + '-' + fmt(PAIR); return CFG.CODE_PREFIX[kind] + '-' + (hash(PID + kind + CFG.VERSION) % 1000000).toString().padStart(6, '0'); };

  // ---------- DataPipe ----------
  async function pipeSave(filename, obj) {
    const body = { experimentID: CFG.DATAPIPE_ID, filename, data: JSON.stringify(obj) };
    for (let i = 0; i < 3; i++) {
      try { const r = await fetch('https://pipe.jspsych.org/api/data/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*' }, body: JSON.stringify(body) }); if (r.ok) return true; } catch (e) { }
      await new Promise(res => setTimeout(res, 1500));
    }
    return false;
  }
  async function pipeSaveBase64(filename, b64) {
    const body = { experimentID: CFG.DATAPIPE_ID, filename, data: b64 };
    try { const r = await fetch('https://pipe.jspsych.org/api/base64/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*' }, body: JSON.stringify(body) }); return r.ok; } catch (e) { return false; }
  }
  async function pipeCondition(expID) {
    try { const r = await fetch('https://pipe.jspsych.org/api/condition/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*' }, body: JSON.stringify({ experimentID: expID }) }); if (!r.ok) return null; const j = await r.json(); return (j && typeof j.condition === 'number') ? j.condition : null; } catch (e) { return null; }
  }
  // 区组 10：ER3 E0 2 LR 2 L0 3；顺序由固定种子打乱（各层不同），DataPipe 顺序发号 0..9 循环
  const BLOCK = ['ER', 'ER', 'ER', 'E0', 'E0', 'LR', 'LR', 'L0', 'L0', 'L0'];
  function blockPattern(seedStr) { let s = hash(seedStr) || 1; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; const b = BLOCK.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
  async function assignCell(stratum) {
    const expID = CFG.STRATIFY ? CFG.STRATA_IDS[stratum] : CFG.DATAPIPE_ID;
    const cond = await pipeCondition(expID);
    const pattern = blockPattern('LG-v20-' + (CFG.STRATIFY ? stratum : 'all'));
    if (cond === null) { const c = Math.floor(Math.random() * 10); return { cell: pattern[c], cond: c, source: 'local-fallback' }; }
    return { cell: pattern[cond % 10], cond, source: 'datapipe' };
  }

  // ---------- jsPsych ----------
  const jsPsych = initJsPsych({
    extensions: (typeof Naodao !== 'undefined') ? [{ type: Naodao }] : [],
    on_finish: function () { /* 各会话在最后一个 trial 内保存与跳转 */ }
  });
  const T = [];
  const H = (s) => `<div class="lg-box">${s}</div>`;
  const btn = (html, opts) => Object.assign({ type: jsPsychHtmlButtonResponse, stimulus: H(html), choices: ['继续'], data: { tag: 'info' } }, opts || {});
  const form = (title, fields, tag, extra) => Object.assign({ type: jsPsychSurveyHtmlForm, preamble: `<div class="lg-box"><h3>${title}</h3></div>`, html: `<div class="lg-box lg-form">${fields}</div>`, button_label: '继续', data: { tag }, on_finish: (d) => { log(tag, Object.assign({}, d.response)); } }, extra || {});
  const radio = (name, items, req = true) => items.map((it, i) => `<label class="lg-radio"><input type="radio" name="${name}" value="${it.v !== undefined ? it.v : i}" ${req ? 'required' : ''}> ${it.t || it}</label>`).join('');
  const likert = (name, q, lo, hi, n = 7) => `<div class="lg-q"><div>${q}</div><div class="lg-likert"><span>${lo}</span>${Array.from({ length: n }, (_, i) => `<label><input type="radio" name="${name}" value="${i + 1}" required>${i + 1}</label>`).join('')}<span>${hi}</span></div></div>`;
  const slider0_10 = (name, label) => `<div class="lg-sl"><label>${label}</label><input type="range" name="${name}" min="0" max="10" value="0" step="1" oninput="this.nextElementSibling.textContent=this.value"><output>0</output></div>`;

  // ---------- 通用：花园 ----------
  function gardenTrial(tag, people) {
    const order = shuffle([0, 1, 2, 3, 4]);
    const names = [people[0], people[1], people[2], '现在的自己', '五年后的自己'];
    const keys = ['P1', 'P2', 'P3', 'S', 'F'];
    const html = `<div class="lg-box"><h3>今天的花园</h3><p>想象你有 <b>100 份养分</b>，请把它们分给下面五棵树。合计必须正好是 100；"现在的自己"至少 1 份。</p>
      <div id="lg-garden">${order.map(i => `<div class="lg-row"><span class="lg-name">${names[i]}</span><input type="range" data-k="${keys[i]}" min="0" max="100" value="0" step="1"><output>0</output></div>`).join('')}</div>
      <p class="lg-sum">已分配：<b id="lg-sum">0</b> / 100</p></div>`;
    return { type: jsPsychHtmlButtonResponse, stimulus: html, choices: ['提交分配'], data: { tag }, on_load: function () {
        const b = document.querySelector('.jspsych-btn'); b.disabled = true;
        const inputs = [...document.querySelectorAll('#lg-garden input')]; const t0 = performance.now(); const trace = [];
        const upd = () => { const sum = inputs.reduce((a, x) => a + (+x.value), 0); document.getElementById('lg-sum').textContent = sum; const S = +inputs.find(x => x.dataset.k === 'S').value; b.disabled = !(sum === 100 && S >= 1); };
        inputs.forEach(x => { x.addEventListener('input', () => { x.nextElementSibling.textContent = x.value; trace.push([Math.round(performance.now() - t0), x.dataset.k, +x.value]); upd(); }); });
        window.__lgGarden = () => { const o = {}; inputs.forEach(x => o[x.dataset.k] = +x.value); return { shares: o, order: order.map(i => keys[i]), trace, sec: Math.round((performance.now() - t0) / 1000) }; };
      }, on_finish: function (d) { const g = window.__lgGarden(); Object.assign(d, g); log(tag, g); } };
  }
  const gcache = {};
  function gardenLazy(tag, afterFn) {
    return { type: jsPsychHtmlButtonResponse, stimulus: () => { gcache[tag] = gardenTrial(tag, window.__people); return gcache[tag].stimulus; }, choices: ['提交分配'], data: { tag },
      on_load: () => gcache[tag].on_load(), on_finish: async (d) => { gcache[tag].on_finish(d); if (afterFn) await afterFn(d); } };
  }
  // ---------- 通用：情绪（自述 + 九标签） ----------
  const EMO = ['平静', '忧伤', '愉悦', '放松', '不安', '紧迫感', '敬畏', '感动'];
  function emotionTrial(tag) {
    const order = shuffle(EMO);
    const fields = `<div class="lg-q"><div>请用几个词或一两句话描述<b>此刻的感受</b>：</div><textarea name="free" rows="3" required></textarea></div>
      <p>下面每一项，此刻你感受到的程度（0 = 完全没有，10 = 非常强烈）：</p>${order.map(e => slider0_10('e_' + e, e)).join('')}
      <div class="lg-sl"><label>其他（可填写）</label><input type="text" name="e_other_txt" placeholder="如有其他感受可写在这里"></div>${slider0_10('e_other', '其他的强度')}
      ${slider0_10('mixed', '此刻我同时有高兴和难过两种感受')}`;
    return form('此刻的感受', fields, tag, { on_finish: (d) => { const r = Object.assign({ order }, d.response); log(tag, r); } });
  }
  // ---------- 通用：日记 / 录音 ----------
  function diaryTrials(tag, prompt) {
    const choose = { type: jsPsychHtmlButtonResponse, stimulus: H(`<h3>说一说</h3><p>${prompt}</p><p>你可以用<b>语音</b>（不超过 90 秒）或<b>打字</b>回答，也可以跳过。</p>`), choices: ['用语音', '用打字', '跳过'], data: { tag: tag + '_choice' }, on_finish: (d) => { log(tag + '_choice', { choice: ['voice', 'text', 'skip'][d.response] }); } };
    const voice = { timeline: [
      { type: jsPsychInitializeMicrophone, data: { tag: tag + '_mic' }, on_finish: (d) => { log(tag + '_mic', { ok: true }); } },
      { type: jsPsychHtmlAudioResponse, stimulus: H(`<h3>请开始说</h3><p>${prompt}</p><p class="lg-muted">最长 90 秒；说完点"完成"。</p>`), recording_duration: 90000, show_done_button: true, done_button_label: '完成', allow_playback: false, data: { tag: tag + '_voice' },
        on_finish: (d) => { log(tag + '_voice', { rt: d.rt, has_audio: !!d.response, bytes: d.response ? d.response.length : 0 }); window.__lgAudioB64 = d.response || null; d.response = null; } },
      { type: jsPsychHtmlButtonResponse, choices: [], trial_duration: 999999, stimulus: '<div class="lg-box"><h3>正在保存录音…</h3><p id="lg-up">请不要关闭页面。</p></div>', data: { tag: tag + '_upload' }, on_load: async function () {
          const el = document.getElementById('lg-up'); const b64 = window.__lgAudioB64; let ok = false;
          if (b64) { const fn = `${PID}_${SESSION}_${tag}.webm`; for (let i = 0; i < 3 && !ok; i++) { ok = await pipeSaveBase64(fn, b64); if (!ok) await new Promise(r => setTimeout(r, 2000)); } store[tag + '_voice'].uploaded = ok; store[tag + '_voice'].file = fn; }
          window.__lgAudioB64 = null;
          el.innerHTML = ok ? '<b style="color:#3C7A34">录音已保存。</b>' : '<b style="color:#C00000">录音未能上传</b>（网络问题）。请在下一页用打字回答，谢谢。';
          setTimeout(() => jsPsych.finishTrial({ uploaded: ok }), ok ? 1200 : 2500);
        } }
    ], conditional_function: () => store[tag + '_choice'] && store[tag + '_choice'].choice === 'voice' };
    const text = { timeline: [form('写一写', `<div class="lg-q"><div>${prompt}</div><textarea name="diary" rows="6" required></textarea></div>`, tag + '_text')], conditional_function: () => { const c = store[tag + '_choice'] && store[tag + '_choice'].choice; const v = store[tag + '_voice']; return c === 'text' || (c === 'voice' && (!v || !v.has_audio || !v.uploaded)); } };
    return [choose, voice, text];
  }
  // ---------- 通用：结束保存 ----------
  function finishTrial(kind, extraFn) {
    return { type: jsPsychHtmlButtonResponse, choices: [], trial_duration: 999999, stimulus: '<div class="lg-box"><h3>正在保存…</h3><p id="lg-save">请不要关闭页面。</p></div>', data: { tag: 'finish' }, on_load: async function () {
        if (extraFn) extraFn();
        if (kind === 'd0') { PAIR = makeCode(window.__lgRand5 || rand5(), hoursNow()); try { localStorage.setItem(LS('pair'), PAIR); localStorage.setItem('lg_last_pair', PAIR); } catch (e) { } }
        const payload = { pid: PID, platform: PLATFORM, platform_uid: qs.get('uid') || null, session: SESSION, pair_code: PAIR, pair_wechat: (SESSION === 'd0' ? ((store.consent || {}).contact_norm || null) : (window.__lgPairWechat || null)), version: CFG.VERSION, ua: navigator.userAgent, start: window.__lgStart, end: nowISO(), store, events: evt };
        const ok = await pipeSave(`${PID}_${SESSION}.json`, payload);
        try { localStorage.setItem(LS(SESSION + '_done'), nowISO()); } catch (e) { }
        const c = code(kind);
        const el = document.getElementById('lg-save');
        const retUrl = RETURN_URL ? (decodeURIComponent(RETURN_URL) + (RETURN_URL.includes('?') ? '&' : '?') + 'code=' + c + '&uid=' + encodeURIComponent(PID)) : null;
        const retBtn = retUrl ? `<p><button class="jspsych-btn" id="lg-return">我已记下完成码，返回平台</button></p>` : `<p>${TXT.after_code}</p>`;
        const saved = ok ? '<b>已保存。</b>' : '<b>保存遇到问题</b>，请截图此页并联系研究人员。';
        if (kind === 'd0') { el.innerHTML = `${saved}<br><br>你的<b>完成码（也是明天的连接码）</b>：<div class="lg-code">${c}</div><p><b>请截图保存这个码</b>，也可以把它发到自己微信的"文件传输助手"。明天做任务时输入它；万一找不到，填你今天留下的微信号也可以。</p><p>${TXT.d0_next}</p>${retBtn}`; }
        else { el.innerHTML = `${saved}<br><br>你的完成码：<div class="lg-code">${c}</div>${retBtn}`; }
        if (retUrl) { document.getElementById('lg-return').onclick = () => { location.href = retUrl; }; }
        try { if (window.parent && window.parent !== window) { window.parent.postMessage({ status: 'finished', participant: PID, code: c }, '*'); } } catch (e) { }
      } };
  }

  // ============================================================ D0
  function buildD0() {
    window.__lgStart = nowISO(); ev('d0_start'); window.__lgRand5 = rand5();
    // 同意
    T.push({ type: jsPsychSurveyHtmlForm, preamble: `<div class="lg-box"><h2>参加之前，请先看这几条</h2>
      <p><b>这是什么。</b>一个关于"引导练习"的研究。今天约 30 分钟：几份问卷、一个"分养分"的小任务、戴耳机听一段约 10 分钟的引导练习。明天约 10 分钟问卷。一个月后有一次约 3 分钟的回访，参不参加你定。</p>
      <p><b>练习是什么。</b>先安定呼吸，然后想象自己来到人生中的某一天，在那一天停一会儿，或者回想自己的经历，最后回到现在。这是想象练习，不是治疗。练习有几个版本，你会随机听到一个，结束时会告诉你。</p>
      <p><b>会不会不舒服。</b>可能有一点忧伤或不安，一般很快过去。页面上有一张"资源卡"写着可以怎么做。你随时可以停下来或退出。</p>
      <p><b>退出。</b>随时可以退出，不用说理由；已经做完的部分，报酬照样给。</p>
      <p><b>录音。</b>练习后会请你说一段感受。可以录音，也可以打字，也可以跳过。录音只有研究人员会听，会转成文字并去掉能认出你的信息。</p>
      <p><b>报酬。</b>今天做完一份，明天做完一份，一个月后回访再一份。明天还有一小笔钱，你自己决定现在领、一个月后领，还是捐掉。钱由平台或研究者的微信发给你，数额见任务说明。</p>
      <p><b>微信。</b>请留下你的微信号。研究者会加你，用来明天提醒你、发放报酬，以及你有需要时联系你，不做别的用途。</p>
      <p><b>你的信息。</b>我们会问出生年月、性别、职业、工作年限。数据只用编号，不会出现你的名字。今天结束时你会得到一个 8 位码，请截图，明天和回访都要用。</p></div>`,
      html: `<div class="lg-box lg-form"><label class="lg-radio"><input type="checkbox" name="c1" required> 我看懂了，自愿参加</label><label class="lg-radio"><input type="checkbox" name="c2" required> 我知道随时可以退出，已完成部分的报酬照样给</label><label class="lg-radio"><input type="checkbox" name="c3" required> 我同意研究者通过微信联系我</label>
      <div class="lg-q"><div>录音：</div>${radio('rec', ['可以录音（也可以打字或跳过）', '只打字，不录音'])}</div>
      <div class="lg-q"><div>你的微信号：</div><input type="text" name="contact" required placeholder="请填微信号"></div></div>`, button_label: '同意，开始', data: { tag: 'consent' }, on_finish: (d) => { const r = Object.assign({}, d.response); r.contact_norm = (r.contact || '').trim().toLowerCase().replace(/\s+/g, ''); log('consent', r); try { localStorage.setItem('lg_last_wechat', r.contact_norm); } catch (e) { } } });
    // 筛查
    T.push(form('几个筛查问题', `
      ${radio('age_ok', [{ t: '22–55 岁', v: 1 }, { t: '不在此范围', v: 0 }])}
      <div class="lg-q"><div>过去 6 个月，是否有至亲去世？</div>${radio('bereave', [{ t: '否', v: 0 }, { t: '是', v: 1 }])}</div>
      <div class="lg-q"><div>过去 12 个月，你本人是否被诊断危及生命的疾病？</div>${radio('illness', [{ t: '否', v: 0 }, { t: '是', v: 1 }])}</div>
      <div class="lg-q"><div>目前是否在接受精神科药物治疗、心理治疗或危机干预？</div>${radio('treat', [{ t: '否', v: 0 }, { t: '是', v: 1 }])}</div>
      <div class="lg-q"><div>是否有听力问题或没有耳机？</div>${radio('hear', [{ t: '否，我有耳机且听力正常', v: 0 }, { t: '是', v: 1 }])}</div>
      <div class="lg-q"><div>过去 3 个月，是否参加过涉及死亡或寿命、跨期选择、冥想训练或"生命花园"的研究？</div>${radio('prior', [{ t: '否', v: 0 }, { t: '是', v: 1 }])}</div>
      <div class="lg-q"><div>目前工作状态：</div>${radio('employ', [{ t: '全职在职', v: 1 }, { t: '稳定兼职', v: 2 }, { t: '不在职', v: 0 }])}</div>`, 'screen'));
    // PHQ-9
    const phq = ['做事时提不起劲或没有兴趣', '感到心情低落、沮丧或绝望', '入睡困难、睡不安稳或睡眠过多', '感觉疲倦或没有活力', '食欲不振或吃太多', '觉得自己很糟，或觉得自己很失败，或让自己或家人失望', '对事物专注有困难，例如阅读报纸或看电视时', '动作或说话速度缓慢到别人已经察觉，或正好相反——烦躁或坐立不安、动来动去的情况更胜于平常', '有不如死掉或用某种方式伤害自己的念头'];
    T.push(form('过去两周，你有多少天受到以下问题的困扰？', phq.map((q, i) => `<div class="lg-q"><div>${i + 1}. ${q}</div>${radio('phq' + (i + 1), [{ t: '完全没有', v: 0 }, { t: '有几天', v: 1 }, { t: '一半以上的天数', v: 2 }, { t: '几乎每天', v: 3 }])}</div>`).join(''), 'phq9'));
    // 筛查判定
    T.push({ type: jsPsychCallFunction, func: () => { const s = store.screen, p = store.phq9; const sum = Object.keys(p).filter(k => /^phq\d$/.test(k)).reduce((a, k) => a + (+p[k]), 0); const excl = (+s.age_ok === 0) || +s.bereave === 1 || +s.illness === 1 || +s.treat === 1 || +s.hear === 1 || +s.prior === 1 || +s.employ === 0 || sum >= 15 || +p.phq9 >= 1; log('eligibility', { eligible: !excl, phq_sum: sum, phq9_item9: +p.phq9 }); } });
    T.push({ timeline: [{ type: jsPsychHtmlButtonResponse, stimulus: H(`<h3>感谢你的参与</h3><p>根据筛查结果，本研究这次不太适合你，你的回答不会被用于分析。</p><p>${CFG.RESOURCE_CARD}</p><p>你的完成码：<span class="lg-code">${code('out')}</span></p>`), choices: ['结束'], data: { tag: 'screened_out' }, on_finish: async () => { await pipeSave(`${PID}_${SESSION}_screenout.json`, { pid: PID, eligibility: store.eligibility, t: nowISO() }); if (RETURN_URL) location.href = decodeURIComponent(RETURN_URL) + (RETURN_URL.includes('?') ? '&' : '?') + 'code=' + code('out') + '&uid=' + encodeURIComponent(PID); else jsPsych.endExperiment(''); } }], conditional_function: () => !store.eligibility.eligible });
    // 基线
    const yrs = Array.from({ length: 40 }, (_, i) => 1970 + i);
    T.push(form('基本信息', `
      <div class="lg-q"><div>出生年份：</div><select name="birth_year" required><option value="">请选择</option>${yrs.map(y => `<option>${y}</option>`).join('')}</select> 月份：<select name="birth_month" required><option value="">请选择</option>${Array.from({ length: 12 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></div>
      <div class="lg-q"><div>性别：</div>${radio('sex', [{ t: '男', v: 'M' }, { t: '女', v: 'F' }])}</div>
      <div class="lg-q"><div>第一次全职工作是哪一年开始的？</div><select name="first_job_year" required><option value="">请选择</option>${Array.from({ length: 40 }, (_, i) => `<option>${1990 + i}</option>`).join('')}</select></div>
      <div class="lg-q"><div>职业类别：</div>${radio('occupation', ['企业职员 / 管理', '专业技术人员', '服务业 / 销售', '一线操作 / 物流 / 快递', '机关事业单位', '自由职业 / 创业', '其他'])}</div>
      <div class="lg-q"><div>你觉得自己大概能活到多少岁？（填一个数字）</div><input type="number" name="sle" min="30" max="120" required></div>
      <div class="lg-q"><div>你预计自己大约几岁退休？（填一个数字）</div><input type="number" name="ret_age" min="30" max="90" required></div>
      <p><b>小时候（12 岁以前）的家庭情况：</b></p>${likert('ses1', '我家比大多数同龄人家里有钱', '完全不符合', '完全符合')}${likert('ses2', '我在一个相对富裕的社区长大', '完全不符合', '完全符合')}${likert('ses3', '和同龄人比，我小时候不缺钱花', '完全不符合', '完全符合')}
      ${likert('fsc1', '五年后的我和现在的我，本质上是同一个人', '完全不同意', '完全同意')}${likert('fsc2', '我能清楚地想象五年后的自己', '完全不同意', '完全同意')}
      ${likert('gen1', '我愿意把自己的经验和知识传给年轻人', '完全不同意', '完全同意')}${likert('gen2', '我希望自己做的事能在我之后继续产生影响', '完全不同意', '完全同意')}
      <div class="lg-q"><div>你以前有没有做过冥想或类似的练习？</div>${radio('med_exp', [{ t: '从来没有', v: 0 }, { t: '试过几次', v: 1 }, { t: '有一段时间规律地做过', v: 2 }, { t: '一直在做', v: 3 }])}</div>
      <div class="lg-q"><div>过去四周做过几天？</div><input type="number" name="med_days" min="0" max="28" required></div>`, 'baseline', { on_finish: (d) => { const r = d.response; const tenure = (new Date().getFullYear()) - (+r.first_job_year); r.tenure_years = tenure; r.stratum = (tenure <= 5 ? 'T1' : (tenure <= 15 ? 'T2' : 'T3')) + '_' + r.sex; log('baseline', r); } }));
    // 死亡认知、目标与底线、沉没成本（随机化前）
    T.push(form('几个关于自己的问题', `
      <div class="lg-q"><div>你第一次意识到"人终有一死"，大约几岁？</div><input type="number" name="dc_age" min="1" max="60" required></div>
      <div class="lg-q"><div>平时多久会想到一次"人会死"这件事？</div>${radio('dc_freq', ['几乎从不', '一年几次', '每月几次', '每周几次', '几乎每天'])}</div>
      <div class="lg-q"><div>想到这件事时，通常最后是以什么状态收尾？</div>${radio('dc_end', ['很快就放下了', '想抓紧做一些值得做的事', '觉得无法控制，随它去', '会郁闷一阵', '其他'])}</div>
      <div class="lg-q"><div>你有没有一个明确的、希望在某个年龄之前完成的目标？</div>${radio('goal_has', [{ t: '有', v: 1 }, { t: '没有', v: 0 }])}<input type="text" name="goal_txt" placeholder="如果有，请写一句（可不填）"></div>
      <div class="lg-q"><div>对你来说，生活至少要达到什么状态才算过得去？（一句话）</div><input type="text" name="floor_txt" required></div>
      <div class="lg-q"><div>情境：你花了 800 元买了一张下周的音乐会门票（不能退）。到那天你很累，而且觉得去了也不会太享受。你会去吗？</div>${radio('sunk', [{ t: '肯定不去', v: 1 }, { t: '可能不去', v: 2 }, { t: '可能去', v: 3 }, { t: '肯定去', v: 4 }])}</div>`, 'individual'));
    // 三位重要之人
    T.push(form('三位对你重要的人', `<p>请写下三位对你来说重要的人的称呼（比如"妈妈""小李"），并选择关系类别。今天和明天的花园任务都会用到。</p>
      ${[1, 2, 3].map(i => `<div class="lg-q"><div>第 ${i} 位：</div><input type="text" name="p${i}" required placeholder="称呼"> <select name="p${i}_rel" required><option value="">关系</option><option>家人</option><option>伴侣</option><option>朋友</option><option>同事</option><option>其他</option></select></div>`).join('')}`, 'people', { on_finish: (d) => { log('people', d.response); window.__people = [d.response.p1, d.response.p2, d.response.p3]; try { localStorage.setItem(LS('people'), JSON.stringify(window.__people)); } catch (e) { } } }));
    T.push(gardenLazy('garden_pre'));
    // 现实计划①
    T.push(form('接下来一个月', `<p>接下来一个月，你最想做的<b>三件事</b>是什么？每件写一句，并回答两个小问题。</p>
      ${[1, 2, 3].map(i => `<div class="lg-q"><div>第 ${i} 件：</div><input type="text" name="plan${i}" required><div>主要是为了：${radio('plan' + i + '_who', ['现在的自己', '五年后的自己', '家人或重要的人', '工作或组织'])}</div><div>打算什么时候开始：${radio('plan' + i + '_when', ['本周', '本月', '更晚'])}</div><div>它是：${radio('plan' + i + '_type', ['理想目标', '必须完成的事'])}</div></div>`).join('')}`, 'plans_pre'));
    // 情绪①
    T.push(emotionTrial('emotion_pre'));
    // 试听
    T.push({ timeline: [
      { type: jsPsychHtmlButtonResponse, stimulus: H(`<h3>试听</h3><p>请戴好耳机，点击播放，确认能听清、音量合适。</p><audio id="lg-check" src="${CFG.AUDIO.CHECK}" controls></audio>`), choices: ['能听清，继续', '听不清 / 放不出来'], data: { tag: 'soundcheck' }, on_finish: (d) => { log('soundcheck', { ok: d.response === 0 }); ev('soundcheck', { ok: d.response === 0 }); } },
      { timeline: [{ type: jsPsychHtmlButtonResponse, stimulus: H(`<h3>请检查设备</h3><p>请确认耳机已连接、手机没有静音，然后返回重试。如果仍然无法播放，请截图本页，之后在微信上告诉研究者。</p>`), choices: ['返回重试'], data: { tag: 'soundcheck_fail' } }], conditional_function: () => !store.soundcheck.ok }
    ], loop_function: () => !store.soundcheck.ok });
    // 随机化
    T.push({ type: jsPsychCallFunction, async: true, func: async (done) => { const a = await assignCell(store.baseline.stratum); log('assignment', { cell: a.cell, cond: a.cond, source: a.source, stratum: store.baseline.stratum }); window.__cell = a.cell; try { const pre = new Audio(); pre.preload = 'auto'; pre.src = CFG.AUDIO[a.cell]; window.__lgPre = pre; } catch (e) { } try { localStorage.setItem(LS('cell'), a.cell); } catch (e) { } done(); } });
    // 音频前提示
    T.push({ type: jsPsychHtmlButtonResponse, stimulus: H(`<h3>引导练习（约 10 分钟）</h3><p>接下来你会听到一段引导练习。请在安静、不会被打扰的地方，戴好耳机。你不需要相信任何说法，也不需要得到某种感受；任何时候都可以睁眼、暂停或退出。</p><div class="lg-card">${CFG.RESOURCE_CARD}</div>`), choices: ['开始练习', '我不想做这次练习'], data: { tag: 'pre_audio' }, on_finish: (d) => { log('pre_audio', { start: d.response === 0 }); } });
    // 播放器（不可拖动）
    T.push({ timeline: [{ type: jsPsychHtmlButtonResponse, stimulus: () => H(`<h3>引导练习</h3><p id="lg-audio-msg">点击下方按钮开始播放，播放完成后会出现"继续"。</p><audio id="lg-audio" src="${CFG.AUDIO[window.__cell]}" preload="auto"></audio><div class="lg-player"><button type="button" id="lg-play">播放</button> <button type="button" id="lg-pause">暂停</button> <span id="lg-state">未开始</span></div><p class="lg-muted">没有进度条，不能拖动；可以暂停，也可以退出。</p>`), choices: ['继续', '退出这次练习'], data: { tag: 'audio' }, on_load: () => {
        const a = document.getElementById('lg-audio'); const btns = document.querySelectorAll('.jspsych-btn'); btns[0].disabled = true; const secs = new Set(); let lastT = 0; const t0 = Date.now(); let plays = 0, pauses = 0;
        document.getElementById('lg-play').onclick = () => { a.play(); plays++; document.getElementById('lg-state').textContent = '播放中'; ev('audio_play'); };
        document.getElementById('lg-pause').onclick = () => { a.pause(); pauses++; document.getElementById('lg-state').textContent = '已暂停'; ev('audio_pause'); };
        a.addEventListener('timeupdate', () => { const c = Math.floor(a.currentTime); if (c > lastT + 2) { a.currentTime = lastT; } else { secs.add(c); lastT = c; } });
        a.addEventListener('ended', () => { btns[0].disabled = false; document.getElementById('lg-state').textContent = '播放完成'; document.getElementById('lg-audio-msg').textContent = '练习结束，请点"继续"。'; ev('audio_ended'); });
        document.addEventListener('visibilitychange', () => ev('visibility', { hidden: document.hidden }));
        window.__lgAudio = () => ({ unique_sec: secs.size, duration: a.duration || null, plays, pauses, wall_sec: Math.round((Date.now() - t0) / 1000) });
      }, on_finish: (d) => { const s = window.__lgAudio(); s.completed = d.response === 0; Object.assign(d, s); log('audio', s); } }], conditional_function: () => store.pre_audio.start });
    T.push({ timeline: [{ type: jsPsychCallFunction, func: () => { log('audio', { completed: false, unique_sec: 0, declined: true }); } }], conditional_function: () => !store.pre_audio.start });
    // 情绪② + 安全
    T.push(emotionTrial('emotion_post'));
    T.push({ type: jsPsychCallFunction, func: () => { const pre = store.emotion_pre, post = store.emotion_post; const un = +post['e_不安'], sad = +post['e_忧伤'], sadPre = +pre['e_忧伤']; const kw = CFG.SAFETY_KEYWORDS.some(k => (post.free || '').includes(k)); const contact = un >= CFG.SAFETY_UNEASE_THRESHOLD || kw; const support = !contact && sad >= CFG.SAFETY_SAD_THRESHOLD && (sad - sadPre) >= 3; log('safety', { flag_contact: contact, flag_support: support, unease: un, sad, sadPre, keyword: kw }); window.__safety = { contact, support }; } });
    T.push({ timeline: [{ type: jsPsychHtmlButtonResponse, stimulus: () => H(`<h3>谢谢你的回答</h3><p>${window.__safety.contact ? '你的回答显示此刻可能有些不适。研究人员会在 24 小时内通过你留下的方式联系你。' : '有些人在这样的练习后会有一点忧伤，这是常见的，通常很快过去。'}</p><div class="lg-card">${CFG.RESOURCE_CARD}</div>`), choices: ['继续'], data: { tag: 'safety_msg' } }], conditional_function: () => window.__safety.contact || window.__safety.support });
    // 花园②
    T.push(gardenLazy('garden_post'));
    // 日记①
    diaryTrials('diary1', '刚才的练习让你想到了什么、有什么感受？').forEach(x => T.push(x));
    // 体验
    T.push(form('关于刚才的练习', `
      <div class="lg-q"><div>此刻，"十年"在你感觉里有多长？（1 = 非常短，100 = 非常长）</div><input type="number" name="tp_ten" min="1" max="100" required></div>
      ${slider0_10('tp_pass', '此刻你觉得时间流逝得有多快（0 慢–10 快）')}${slider0_10('engage', '你有多投入')}${slider0_10('wander', '走神的程度')}${slider0_10('return', '走神后回到声音的容易程度')}${slider0_10('vivid', '画面的生动程度')}
      <div class="lg-q"><div>练习时你是闭着眼睛的吗？</div>${radio('eyes', ['大部分时间闭着', '一半一半', '大部分时间睁着'])}</div>
      <div class="lg-q"><div>练习一开始，引导你注意的是：</div>${radio('mem1', ['身体与椅子的接触', '房间里的光线', '一段音乐', '记不清'])}</div>
      <div class="lg-q"><div>练习最后，引导你做的是：</div>${radio('mem2', ['回到房间、动一动肩膀和手指', '写下三件事', '深呼吸十次', '记不清'])}</div>`, 'experience'));
    // 结束
    T.push(btn(`<h3>今天的任务完成了</h3><p><b>明天任何时候都可以做第二天的任务（约 10 分钟）——请睡一觉之后再来。</b>我们会通过你留下的方式提醒你；请从平台发给你的链接进入。</p><p>刚才的内容是一种想象练习，不是对你生活的判断，也不是对未来的预言。</p><div class="lg-card">${CFG.RESOURCE_CARD}</div>`, { choices: ['保存并结束'] }));
    T.push(finishTrial('d0'));
  }

  // ---------- 连接码输入（D+1 与回访） ----------
  function codeEntryTrials(kind, enforceGap) {
    let last = ''; try { last = localStorage.getItem('lg_last_pair') || ''; } catch (e) { }
    const entry = { type: jsPsychSurveyHtmlForm, preamble: `<div class="lg-box"><h3>请输入你的连接码</h3><p>就是第一天结束时页面上显示、请你截图保存的那个 8 位码（也是第一天的完成码）。大小写不限，可带横线。</p><p class="lg-muted">忘记了？在微信上问研究者，我们会帮你找回。</p></div>`,
      html: `<div class="lg-box lg-form"><input type="text" name="code" value="${last ? fmt(last) : ''}" autocomplete="off" style="font-size:22px;letter-spacing:2px;width:100%;box-sizing:border-box;padding:8px" placeholder="例如 K7M3-PX2Q"><p class="lg-muted">找不到码？可以改填你第一天留下的<b>微信号</b>（两项填一项即可）：</p><input type="text" name="wechat" value="${(() => { try { return localStorage.getItem('lg_last_wechat') || ''; } catch (e) { return ''; } })()}" autocomplete="off" style="font-size:18px;width:100%;box-sizing:border-box;padding:8px" placeholder="第一天填写的微信号"><p id="lg-code-msg" style="color:#C00000"></p></div>`, button_label: '继续', data: { tag: 'pair_entry' },
      on_finish: (d) => { const rawCode = (d.response.code || '').trim(); const wx = (d.response.wechat || '').trim().toLowerCase().replace(/\s+/g, ''); const r = rawCode ? parseCode(rawCode) : { ok: false, reason: 'empty' }; const now = hoursNow(); let gap = null; if (r.ok) { gap = ((now - r.hours) % 1024 + 1024) % 1024; } const okAny = r.ok || wx.length >= 3; log('pair', { raw: rawCode, ok: okAny, code_ok: r.ok, reason: r.ok ? null : (r.reason || null), code: r.ok ? r.code : null, wechat: wx || null, gap_hours: gap }); if (r.ok) { PAIR = r.code; } else if (wx) { PAIR = null; window.__lgPairWechat = wx; } } };
    const bad = { timeline: [{ type: jsPsychHtmlButtonResponse, stimulus: () => H(`<h3>还没能对上</h3><p>${store.pair.reason === 'format' ? '连接码应为 8 位（字母和数字，不含 0、O、1、I）；也可以只填第一天留下的微信号。' : (store.pair.reason === 'check' ? '这个码有一位输错了，请对照截图再输一次；或者只填第一天留下的微信号。' : '请填连接码，或者第一天留下的微信号（填一项即可）。')}</p>`), choices: ['重新输入'], data: { tag: 'pair_bad' } }], conditional_function: () => !store.pair.ok };
    const loop = { timeline: [entry, bad], loop_function: () => !store.pair.ok };
    const early = { timeline: [{ type: jsPsychHtmlButtonResponse, stimulus: () => H(`<h3>还没到时间</h3><p>第二天的任务需要在第一天完成至少 ${CFG.MIN_GAP_HOURS} 小时之后进行——请睡一觉之后再来。你的连接码仍然有效。</p>`), choices: [], trial_duration: 999999, data: { tag: 'pair_early' } }], conditional_function: () => enforceGap && store.pair.gap_hours !== null && store.pair.gap_hours < CFG.MIN_GAP_HOURS };
    return [loop, early];
  }

  // ============================================================ D+1
  function buildD1() {
    window.__lgStart = nowISO(); ev('d1_start');
    let gapH = null;
    codeEntryTrials('d1', true).forEach(x => T.push(x));
    T.push({ type: jsPsychCallFunction, func: () => { gapH = store.pair.gap_hours; } });
    T.push(form('三位重要的人', `<p>请填写你第一天填过的三位重要之人的称呼（尽量和昨天一致）。</p>${[1, 2, 3].map(i => `<div class="lg-q"><div>第 ${i} 位：</div><input type="text" name="p${i}" required></div>`).join('')}`, 'people_d1', { on_load: () => { try { const pp = JSON.parse(localStorage.getItem(LS('people')) || 'null'); if (pp) [1, 2, 3].forEach(i => { const el = document.querySelector(`input[name=p${i}]`); if (el) el.value = pp[i - 1] || ''; }); } catch (e) { } }, on_finish: (d) => { log('people_d1', d.response); window.__people = [d.response.p1, d.response.p2, d.response.p3]; } }));
    T.push(emotionTrial('emotion_d1'));
    // 花园③：提交即单独上传
    T.push(gardenLazy('garden_d1', async () => { const ok = await pipeSave(`${PID}_d1_garden.json`, { pid: PID, pair_code: PAIR, pair_wechat: window.__lgPairWechat || null, t: nowISO(), garden_d1: store.garden_d1, emotion_d1: store.emotion_d1, gap_hours_from_code: gapH }); store.garden_d1.saved_alone = ok; }));
    // 现实计划②
    T.push(form('接下来一个月（再问一次）', `<p>请再写一次接下来一个月你最想做的三件事（可以和昨天相同）。</p>
      ${[1, 2, 3].map(i => `<div class="lg-q"><div>第 ${i} 件：</div><input type="text" name="plan${i}" required><div>主要是为了：${radio('plan' + i + '_who', ['现在的自己', '五年后的自己', '家人或重要的人', '工作或组织'])}</div><div>打算什么时候开始：${radio('plan' + i + '_when', ['本周', '本月', '更晚'])}</div></div>`).join('')}
      <div class="lg-q"><div>和昨天相比，这三件事有没有调整？</div>${radio('adjust', ['没有', '换了一件', '提前或推后了', '改了优先级', '其他'])}</div>
      <div class="lg-q"><div>过去 24 小时，你是否实际调整过一项原定安排？如愿意，请简述原先打算做什么、后来实际做了什么；没有调整或不想回答也可以。</div><textarea name="adjust24" rows="3"></textarea></div>`, 'plans_d1'));
    // 小额分配
    T.push(form('一笔小额报酬', `<p>除了任务报酬，你还会得到一笔<b>小额报酬</b>（金额相同）。请选择领取方式：</p>${radio('money', [{ t: '现在领取', v: 'now' }, { t: '一个月后领取', v: 'later' }, { t: '捐给公益项目（由研究团队统一捐出）', v: 'donate' }])}`, 'money'));
    // 生命线
    T.push({ type: jsPsychHtmlButtonResponse, stimulus: H(`<h3>生命线</h3><p>下面这条线代表从出生到未来的一生。回想昨天的练习：你的注意力停留过哪些时间点？请在线上点一点（可以点多次；点错可清除）。</p><svg id="lg-line" width="100%" height="90" viewBox="0 0 600 90"><line x1="30" y1="45" x2="570" y2="45" stroke="#1F4E79" stroke-width="3"/><text x="10" y="75" font-size="12">出生</text><text x="290" y="75" font-size="12">今天</text><text x="540" y="75" font-size="12">未来</text><line x1="300" y1="35" x2="300" y2="55" stroke="#C00000" stroke-width="2"/></svg><div><button type="button" id="lg-clear">清除</button> <span id="lg-n">0 个点</span></div>`), choices: ['完成'], data: { tag: 'lifeline' }, on_load: () => { const svg = document.getElementById('lg-line'); const pts = []; svg.addEventListener('click', (e) => { const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; const pos = Math.max(0, Math.min(1, (x * 600 - 30) / 540)); pts.push({ pos: +pos.toFixed(3), t: nowISO() }); const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', 30 + pos * 540); c.setAttribute('cy', 45); c.setAttribute('r', 6); c.setAttribute('fill', '#2E75B6'); svg.appendChild(c); document.getElementById('lg-n').textContent = pts.length + ' 个点'; }); document.getElementById('lg-clear').onclick = () => { pts.length = 0; [...svg.querySelectorAll('circle')].forEach(x => x.remove()); document.getElementById('lg-n').textContent = '0 个点'; }; window.__lgLine = () => pts.slice(); }, on_finish: (d) => { const p = window.__lgLine(); d.points = p; log('lifeline', { points: p }); } });
    // 换人题 + 回想
    T.push(form('几个小问题', `
      <div class="lg-q"><div>如果现在重新选三位重要的人，你会换人吗？</div>${radio('switch', ['不会', '会换一位', '会换两位或更多'])}</div>
      ${slider0_10('recall', '今天你想起昨天练习内容的程度（0 完全没想起–10 经常想起）')}
      <div class="lg-q"><div>今天有没有自己做过类似的练习？</div>${radio('self_practice', [{ t: '没有', v: 0 }, { t: '有', v: 1 }])}</div>`, 'recall'));
    // 延迟折扣：5 时距 × 5 步滴定
    const delays = [{ k: 'w1', t: '1 周后' }, { k: 'm1', t: '1 个月后' }, { k: 'm3', t: '3 个月后' }, { k: 'y1', t: '1 年后' }, { k: 'y3', t: '3 年后' }];
    T.push(btn(`<h3>选择题</h3><p>接下来是一组选择：每一题请选你更想要的一项。没有对错，按你的真实偏好选。</p>`));
    const dd = { current: null };
    delays.forEach(dl => {
      T.push({ type: jsPsychCallFunction, func: () => { dd.current = { key: dl.k, label: dl.t, imm: 500, step: 250, choices: [] }; } });
      for (let s = 0; s < 5; s++) {
        T.push({ type: jsPsychHtmlButtonResponse, stimulus: () => H(`<h3>你更想要哪一项？</h3><p class="lg-dd"><b>A：现在得到 ${dd.current.imm} 元</b>　　<b>B：${dd.current.label}得到 1000 元</b></p>`), choices: ['A 现在', 'B 以后'], data: { tag: 'dd' }, on_finish: (d) => { const choseNow = d.response === 0; dd.current.choices.push({ imm: dd.current.imm, now: choseNow }); if (choseNow) dd.current.imm -= dd.current.step; else dd.current.imm += dd.current.step; dd.current.step /= 2; if (s === 4) { store['dd_' + dd.current.key] = { label: dd.current.label, choices: dd.current.choices, indiff: dd.current.imm }; } } });
      }
    });
    // 三前提指纹 + 操纵检验
    T.push(form('此刻你的感觉', `${likert('p_scar1', '此刻，我觉得自己剩下的时间不多了', '完全不符合', '完全符合')}${likert('p_scar2', '此刻，我觉得时间很紧、来不及做想做的事', '完全不符合', '完全符合')}${likert('p_unpred', '此刻，我觉得人生中的事情很难预料', '完全不符合', '完全符合')}${likert('p_inev', '此刻，我清楚地意识到生命终有尽头', '完全不符合', '完全符合')}`, 'premises'));
    T.push(form('关于昨天的练习', `
      <div class="lg-q"><div>昨天的练习中，引导你想象来到的是：</div>${radio('mc_ref', ['生命的最后一天', '退休的那一天', '毕业那天', '记不清'])}</div>
      <div class="lg-q"><div>在那一天之后，引导你做的是：</div>${radio('mc_proc', ['从那一天一年一年往回走，回到今天', '留在那一天里，注意周围的细节', '想象十年后的自己', '记不清'])}</div>
      ${slider0_10('mc_walk', '你在多大程度上真的沿着年份"走"回了今天（0 完全没有–10 完全做到）')}`, 'manip'));
    // 日记②
    diaryTrials('diary2', '过去一天有没有想起昨天的练习？想起时是什么感受，你怎么处理这种感受？').forEach(x => T.push(x));
    // 目标与底线复测 + 目的猜测
    T.push(form('最后几个问题', `
      <div class="lg-q"><div>你有没有一个明确的、希望在某个年龄之前完成的目标？</div>${radio('goal_has', [{ t: '有', v: 1 }, { t: '没有', v: 0 }])}<input type="text" name="goal_txt" placeholder="如果有，请写一句（可不填）"></div>
      <div class="lg-q"><div>对你来说，生活至少要达到什么状态才算过得去？（一句话）</div><input type="text" name="floor_txt" required></div>
      <div class="lg-q"><div>你觉得这项研究想了解什么？（一句话）</div><input type="text" name="purpose" required></div>
      <div class="lg-q"><div>一个月后我们会邀请你做一次约 3 分钟的回访，愿意的话我们会通过你留下的方式联系你。</div>${radio('fu_willing', [{ t: '愿意', v: 1 }, { t: '再说', v: 0 }])}</div>`, 'closing'));
    T.push(btn(`<h3>第二天的任务完成了，谢谢你</h3><p>现在可以告诉你：练习有四个版本，只在中间几分钟不同——想象来到的那一天（生命的最后一天，或退休的那一天）和之后的做法（一年一年回望走回今天，或留在那一天）。你听到的是随机分配的一个版本。我们想了解这两种成分各自对第二天资源分配的影响。</p><p>刚才的内容是一种想象练习，不是对你生活的判断。如有任何问题或想删除你的数据，在微信上告诉研究者，或发邮件到 444602451@qq.com。</p><div class="lg-card">${CFG.RESOURCE_CARD}</div>`, { choices: ['保存并结束'] }));
    T.push(finishTrial('d1'));
  }

  // ============================================================ 回访
  function buildFU() {
    window.__lgStart = nowISO(); ev('fu_start');
    codeEntryTrials('fu', false).forEach(x => T.push(x));
    T.push(form('三位重要的人', `<p>请填写你之前填过的三位重要之人的称呼（尽量一致）。</p>${[1, 2, 3].map(i => `<div class="lg-q"><div>第 ${i} 位：</div><input type="text" name="p${i}" required></div>`).join('')}`, 'people_fu', { on_load: () => { try { const pp = JSON.parse(localStorage.getItem(LS('people')) || 'null'); if (pp) [1, 2, 3].forEach(i => { const el = document.querySelector(`input[name=p${i}]`); if (el) el.value = pp[i - 1] || ''; }); } catch (e) { } }, on_finish: (d) => { log('people_fu', d.response); window.__people = [d.response.p1, d.response.p2, d.response.p3]; } }));
    T.push(gardenLazy('garden_fu'));
    T.push(form('几个问题', `${likert('p_scar1', '此刻，我觉得自己剩下的时间不多了', '完全不符合', '完全符合')}${likert('p_scar2', '此刻，我觉得时间很紧、来不及做想做的事', '完全不符合', '完全符合')}${likert('p_unpred', '此刻，我觉得人生中的事情很难预料', '完全不符合', '完全符合')}${likert('p_inev', '此刻，我清楚地意识到生命终有尽头', '完全不符合', '完全符合')}
      <div class="lg-q"><div>上个月你写下的三件事，做了多少？</div>${radio('plan_done', ['都没做', '做了一件', '做了两件', '三件都做了', '记不清写了什么'])}</div>
      <div class="lg-q"><div>这一个月里，有没有自己做过类似的练习？</div>${radio('self_practice', ['没有', '一两次', '经常'])}</div>
      <div class="lg-q"><div>这一个月里，生活中有没有发生重大事件（比如换工作、搬家、亲人生病等）？</div>${radio('life_event', [{ t: '没有', v: 0 }, { t: '有', v: 1 }])}<input type="text" name="life_event_txt" placeholder="如果有，可简单写一下（可不填）"></div>`, 'fu'));
    T.push(btn(`<h3>回访完成，谢谢你</h3>`, { choices: ['保存并结束'] }));
    T.push(finishTrial('fu'));
  }

  // ============================================================ 入口
  T.push({ type: jsPsychPreload, audio: SESSION === 'd0' ? [CFG.AUDIO.CHECK] : [], message: '正在加载…', show_progress_bar: false, continue_after_error: true });
  if (SESSION === 'd1') buildD1(); else if (SESSION === 'fu') buildFU(); else buildD0();
  jsPsych.run(T);
})();
