// ============================================================
// 生命花园 · 研究 1 网页版 · 配置文件（部署前填写）
// ============================================================
window.LG_CONFIG = {
  VERSION: 'web-v20.6-2026-09-22',

  // --- DataPipe（pipe.jspsych.org）---
  // DataPipe 实验 LifeGarden-Study1-data（存储：Google Drive；三个开关已开：数据、base64、条件分配=10）。
  DATAPIPE_ID: 'vs00AoIkQ1hc',

  // 分层随机：true = 六个工龄×性别层各用一个 DataPipe 实验（每个都开 Condition assignment，条件数 10）；
  // false = 全部用上面的 DATAPIPE_ID 一个计数器（不分层，简单）。
  STRATIFY: false,
  STRATA_IDS: {
    'T1_M': 'REPLACE', 'T1_F': 'REPLACE',   // 入职 5 年内
    'T2_M': 'REPLACE', 'T2_F': 'REPLACE',   // 5–15 年
    'T3_M': 'REPLACE', 'T3_F': 'REPLACE'    // 15–30 年
  },

  // --- 音频文件（与 index.html 同目录下的 audio/ 文件夹）---
  AUDIO: { ER: 'audio/ER.mp3', E0: 'audio/E0.mp3', LR: 'audio/LR.mp3', L0: 'audio/L0.mp3', CHECK: 'audio/soundcheck.mp3' },

  // --- 平台 ---
  // 'credamo'、'naodao' 或 'tencent'；入口文件里的 window.LG_PLATFORM 会覆盖这里。影响结束页文案。
  PLATFORM: 'credamo',
  PLATFORM_TEXT: {
    credamo: {
      d0_next: '明天 Credamo 会给你推送第二天的任务（约 10 分钟），研究者也会在微信上提醒你。明天任何时候都可以做——请睡一觉之后再来。',
      after_code: '请回到 Credamo 的页面，把这个码填进"完成码"一题，报酬由平台发放。'
    },
    naodao: {
      d0_next: '明天研究者会在微信上提醒你，请回到脑岛做第二天的任务（约 10 分钟）。明天任何时候都可以做——请睡一觉之后再来。',
      after_code: '请回到脑岛的页面，把这个码填进"完成码"一题，然后提交。'
    },
    tencent: {
      d0_next: '明天研究者会在微信上提醒你，请回到腾讯问卷做第二天的任务（约 10 分钟）。明天任何时候都可以做——请睡一觉之后再来。',
      after_code: '请回到腾讯问卷的页面，把这个码填进"完成码"一题，然后提交。'
    }
  },

  // --- 平台对接 ---
  // 参与者编号从网址参数读取；按顺序尝试下列参数名（Credamo 常用 uid）。
  PID_PARAMS: ['uid', 'pid', 'participant', 'subject', 'id', 'naodao_id'],
  // 完成后跳回平台：若网址里带 return=（已 URL 编码的地址），完成时会跳转到该地址并附加 &code=完成码。
  // 若平台用"填写完成码"的方式，则不需要 return，页面会显示完成码。
  RETURN_PARAM: 'return',
  // 完成码前缀（三次接触各不相同）
  CODE_PREFIX: { d0: 'LG1', d1: 'LG2', fu: 'LG3', out: 'LG0' },

  // --- 时间规则 ---
  MIN_GAP_HOURS: 12,          // D+1 距 D0 完成至少 12 小时（由连接码里的完成小时计算，跨设备也能检查）
  FU_WINDOW_DAYS: [28, 35],   // 回访窗口（仅用于提示，不强制）

  // --- 文案占位（报酬金额待定，不写具体数字）---
  RESOURCE_CARD: '如果此刻感到明显不适：可以先暂停，睁开眼睛，看看房间里的东西，慢慢呼吸几次。需要时可以在微信上告诉研究者，或发邮件到 444602451@qq.com。如果你觉得自己需要更多支持，请联系当地的心理援助机构。你随时可以退出，这不会影响你已经获得的报酬。',
  WECHAT_QR: '',                        // 不再向参与者展示研究者二维码；参与者留微信号，由研究者添加

  // --- 安全规则 ---
  SAFETY_UNEASE_THRESHOLD: 8,          // 不安 ≥ 8 → 人工联系标记
  SAFETY_SAD_THRESHOLD: 6,             // 忧伤 ≥ 6 且比练习前高 ≥ 3 → 自动支持文字
  SAFETY_KEYWORDS: ['自杀', '自残', '伤害自己', '不想活', '活着没意思', '结束生命', '绝望', '解脱']
};
