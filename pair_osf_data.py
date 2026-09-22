#!/usr/bin/env python3
"""生命花园 · 研究 1 · OSF 数据配对与导出（v20.4）
用法：python3 pair_osf_data.py <从 OSF 下载的 data 文件夹> <输出文件夹>
输入：DataPipe 写入的 JSON 文件（编号_d0.json、编号_d1_garden.json、编号_d1.json、编号_fu.json、编号_d0_screenout.json）
输出：
  participants_wide.csv   一人一行：分组、协变量、三次花园份额与 z1/z2、情绪、指纹、折扣指示点、间隔、质量标记
  records_long.csv        每份 JSON 一行的清单（编号、会话、连接码、时间、上传状态）
  pairing_report.txt      配对结果摘要（配上/没配上/重复码/间隔不足）
不做任何统计推断；分组只输出编码 A/B/C/D（cell 到编码的映射由监察人保管的解码表决定）。
"""
import sys, os, json, math, csv, glob, datetime as dt
from collections import defaultdict

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CELL_CODE = {'ER': 'A', 'E0': 'B', 'LR': 'C', 'L0': 'D'}   # 输出只用编码；解码表另存

def load_all():
    recs = []
    for f in glob.glob(os.path.join(SRC, '**', '*.json'), recursive=True):
        try:
            with open(f, encoding='utf-8') as fh: j = json.load(fh)
            if isinstance(j, list): j = j[0] if (j and isinstance(j[0], dict)) else {}   # DataPipe 校验格式：一行的数组
            if isinstance(j, dict) and 'payload_json' in j:
                try: j = json.loads(j['payload_json'])
                except Exception: pass
        except Exception as e:
            recs.append({'file': f, 'error': str(e)}); continue
        name = os.path.basename(f)
        name = name.replace('_retry.json', '.json')
        kind = 'd1_garden' if name.endswith('_d1_garden.json') else ('screenout' if 'screenout' in name else (j.get('session') or 'unknown'))
        wx = j.get('pair_wechat') or ((j.get('store') or {}).get('consent') or {}).get('contact_norm') or ((j.get('store') or {}).get('pair') or {}).get('wechat') or ''
        recs.append({'file': f, 'kind': kind, 'pid': j.get('pid'), 'pair': (j.get('pair_code') or ''), 'wechat': wx, 'platform': j.get('platform'),
                     'platform_uid': j.get('platform_uid'), 'start': j.get('start'), 'end': j.get('end') or j.get('t'), 'json': j})
    return recs

def ts(s):
    try: return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception: return None

def ilr(shares):
    P1, P2, P3, S, F = [max(0.5, float(shares.get(k, 0))) for k in ('P1', 'P2', 'P3', 'S', 'F')]
    z1 = math.sqrt(4 / 5) * math.log(((P1 * P2 * P3 * F) ** 0.25) / S)
    z2 = math.sqrt(3 / 4) * math.log(F / ((P1 * P2 * P3) ** (1 / 3)))
    return z1, z2

def garden_cols(prefix, g):
    if not g: return {}
    sh = g.get('shares', {}); z1, z2 = ilr(sh)
    return {f'{prefix}_P1': sh.get('P1'), f'{prefix}_P2': sh.get('P2'), f'{prefix}_P3': sh.get('P3'), f'{prefix}_S': sh.get('S'), f'{prefix}_F': sh.get('F'),
            f'{prefix}_z1': round(z1, 4), f'{prefix}_z2': round(z2, 4), f'{prefix}_sec': g.get('sec'), f'{prefix}_nmoves': len(g.get('trace') or [])}

def emo_cols(prefix, e):
    if not e: return {}
    out = {}
    for lab in ['平静', '忧伤', '愉悦', '放松', '不安', '紧迫感', '敬畏', '感动']:
        v = e.get('e_' + lab); out[f'{prefix}_{lab}'] = v
    out[f'{prefix}_MIN'] = min(float(e.get('e_平静', 0) or 0), float(e.get('e_忧伤', 0) or 0))
    out[f'{prefix}_mixed'] = e.get('mixed'); out[f'{prefix}_free'] = (e.get('free') or '').replace('\n', ' ')
    return out

recs = load_all()
by_pair = defaultdict(lambda: {'d0': [], 'd1': [], 'd1_garden': [], 'fu': []})
unpaired = []
wx2code = {}
for r in recs:
    if r.get('kind') == 'd0' and r.get('pair') and r.get('wechat'): wx2code.setdefault(r['wechat'], r['pair'])
for r in recs:
    if 'error' in r: continue
    k = r['kind']
    key = r['pair'] or (wx2code.get(r.get('wechat')) if r.get('wechat') else None)   # 无码时用微信号回查 D0 的码
    if k in ('d0', 'd1', 'd1_garden', 'fu') and key: r['pair'] = key; r['paired_by'] = 'code' if r['pair'] == key and (r.get('pair') and not r.get('wechat')) else ('code' if r.get('pair') == key else 'wechat'); by_pair[key][k].append(r)
    elif k != 'screenout': unpaired.append(r)

rows = []; report = []
for pair, g in by_pair.items():
    d0 = sorted(g['d0'], key=lambda x: x['end'] or '')[-1] if g['d0'] else None
    d1 = sorted(g['d1'], key=lambda x: x['end'] or '')[-1] if g['d1'] else None
    d1g = sorted(g['d1_garden'], key=lambda x: x['end'] or '')[-1] if g['d1_garden'] else None
    fu = sorted(g['fu'], key=lambda x: x['end'] or '')[-1] if g['fu'] else None
    if len(g['d0']) > 1: report.append(f'重复连接码（多份 D0）：{pair} ×{len(g["d0"])}')
    row = {'pair_code': pair, 'platform': (d0 or d1 or {}).get('platform'), 'paired_by_wechat': any(x.get('paired_by') == 'wechat' for x in g['d1'] + g['d1_garden'] + g['fu']), 'n_d0': len(g['d0']), 'n_d1': len(g['d1']), 'n_d1_garden': len(g['d1_garden']), 'n_fu': len(g['fu'])}
    if d0:
        j = d0['json']; st = j.get('store', {})
        asg = st.get('assignment', {}); row['cell_code'] = CELL_CODE.get(asg.get('cell'), None); row['assign_source'] = asg.get('source'); row['stratum'] = asg.get('stratum')
        b = st.get('baseline', {}); row.update({'birth_year': b.get('birth_year'), 'sex': b.get('sex'), 'tenure_years': b.get('tenure_years'), 'occupation': b.get('occupation'), 'sle': b.get('sle'), 'ret_age': b.get('ret_age'),
                                              'ses': None if not b else round(sum(float(b.get(k, 0) or 0) for k in ('ses1', 'ses2', 'ses3')) / 3, 2), 'fsc': None if not b else round((float(b.get('fsc1', 0) or 0) + float(b.get('fsc2', 0) or 0)) / 2, 2),
                                              'gen': None if not b else round((float(b.get('gen1', 0) or 0) + float(b.get('gen2', 0) or 0)) / 2, 2), 'med_exp': b.get('med_exp'), 'med_days': b.get('med_days')})
        ind = st.get('individual', {}); row.update({'dc_age': ind.get('dc_age'), 'dc_freq': ind.get('dc_freq'), 'dc_end': ind.get('dc_end'), 'goal_has_pre': ind.get('goal_has'), 'sunk': ind.get('sunk')})
        el = st.get('eligibility', {}); row['phq_sum'] = el.get('phq_sum')
        pp = st.get('people', {}); row.update({'p1_rel': pp.get('p1_rel'), 'p2_rel': pp.get('p2_rel'), 'p3_rel': pp.get('p3_rel')})
        row.update(garden_cols('g_pre', st.get('garden_pre'))); row.update(garden_cols('g_post0', st.get('garden_post')))
        row.update(emo_cols('emo_pre', st.get('emotion_pre'))); row.update(emo_cols('emo_post', st.get('emotion_post')))
        au = st.get('audio', {}); row.update({'audio_completed': au.get('completed'), 'audio_unique_sec': au.get('unique_sec'), 'audio_duration': au.get('duration'), 'audio_pauses': au.get('pauses')})
        sf = st.get('safety', {}); row.update({'safety_contact': sf.get('flag_contact'), 'safety_support': sf.get('flag_support')})
        ex = st.get('experience', {}); row.update({'mem1': ex.get('mem1'), 'mem2': ex.get('mem2'), 'tp_ten': ex.get('tp_ten'), 'tp_pass': ex.get('tp_pass')})
        row['d0_start'] = j.get('start'); row['d0_end'] = j.get('end')
    gsrc = (d1g['json'].get('garden_d1') if d1g else None) or ((d1['json'].get('store', {}).get('garden_d1')) if d1 else None)
    row.update(garden_cols('g_d1', gsrc)); row['d1_garden_saved_alone'] = bool(d1g)
    if d1:
        j = d1['json']; st = j.get('store', {})
        row.update(emo_cols('emo_d1', st.get('emotion_d1')))
        pr = st.get('premises', {}); row.update({'p_scar1': pr.get('p_scar1'), 'p_scar2': pr.get('p_scar2'), 'p_unpred': pr.get('p_unpred'), 'p_inev': pr.get('p_inev')})
        mc = st.get('manip', {}); row.update({'mc_ref': mc.get('mc_ref'), 'mc_proc': mc.get('mc_proc'), 'mc_walk': mc.get('mc_walk')})
        for k in ('w1', 'm1', 'm3', 'y1', 'y3'): row[f'dd_{k}'] = (st.get('dd_' + k) or {}).get('indiff')
        row['money_choice'] = (st.get('money') or {}).get('money'); row['lifeline_n'] = len((st.get('lifeline') or {}).get('points') or [])
        rc = st.get('recall', {}); row.update({'recall': rc.get('recall'), 'self_practice_d1': rc.get('self_practice'), 'switch_people': rc.get('switch')})
        pl = st.get('plans_d1', {}); row.update({'plan_adjust': pl.get('adjust'), 'adjust24': (pl.get('adjust24') or '').replace('\n', ' ')})
        cl = st.get('closing', {}); row.update({'goal_has_d1': cl.get('goal_has'), 'fu_willing': cl.get('fu_willing'), 'purpose_guess': cl.get('purpose')})
        pe = st.get('pair', {}); row['gap_hours_from_code'] = pe.get('gap_hours')
        row['d1_start'] = j.get('start'); row['d1_end'] = j.get('end')
    t0 = ts(row.get('d0_end') or ''); t1 = ts((d1g['end'] if d1g else row.get('d1_end')) or '')
    row['gap_hours_actual'] = round((t1 - t0).total_seconds() / 3600, 2) if (t0 and t1) else None
    row['flag_gap_lt12'] = (row['gap_hours_actual'] is not None and row['gap_hours_actual'] < 12)
    row['in_sensitivity_18_30'] = (row['gap_hours_actual'] is not None and 18 <= row['gap_hours_actual'] <= 30)
    if fu:
        st = fu['json'].get('store', {}); row.update(garden_cols('g_fu', st.get('garden_fu'))); f2 = st.get('fu', {})
        row.update({'fu_plan_done': f2.get('plan_done'), 'fu_self_practice': f2.get('self_practice'), 'fu_life_event': f2.get('life_event'), 'fu_end': fu['json'].get('end')})
    row['has_primary'] = row.get('g_d1_z1') is not None
    rows.append(row)

cols = sorted({k for r in rows for k in r.keys()}, key=lambda k: (0, k) if k in ('pair_code', 'platform', 'cell_code') else (1, k))
with open(os.path.join(OUT, 'participants_wide.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=cols); w.writeheader(); [w.writerow(r) for r in rows]
with open(os.path.join(OUT, 'records_long.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.writer(fh); w.writerow(['file', 'kind', 'pid', 'pair_code', 'platform', 'platform_uid', 'start', 'end', 'error'])
    for r in recs: w.writerow([os.path.basename(r['file']), r.get('kind'), r.get('pid'), r.get('pair'), r.get('platform'), r.get('platform_uid'), r.get('start'), r.get('end'), r.get('error')])
# 安全随访清单（含微信号，只存本地，不上传任何地方）
safe_rows = []
for r in recs:
    if r.get('kind') != 'd0' or 'json' not in r: continue
    st = r['json'].get('store', {}); sf = st.get('safety', {})
    if sf.get('flag_contact') or sf.get('flag_support'):
        safe_rows.append({'pair_code': r['pair'], 'wechat': (st.get('consent') or {}).get('contact', ''), 'd0_end': r['json'].get('end'),
                          'need_contact_24h': bool(sf.get('flag_contact')), 'support_text_only': bool(sf.get('flag_support')),
                          'unease': sf.get('unease'), 'sad': sf.get('sad'), 'sad_pre': sf.get('sadPre'), 'keyword': sf.get('keyword'),
                          'free_text': ((st.get('emotion_post') or {}).get('free') or '').replace('\n', ' ')})
with open(os.path.join(OUT, 'safety_followup_本地保存.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=['pair_code', 'wechat', 'd0_end', 'need_contact_24h', 'support_text_only', 'unease', 'sad', 'sad_pre', 'keyword', 'free_text']); w.writeheader(); [w.writerow(x) for x in safe_rows]
n_d0 = sum(1 for r in rows if r['n_d0']); n_prim = sum(1 for r in rows if r['has_primary']); n_fu = sum(1 for r in rows if r['n_fu'])
report = [f'JSON 文件 {len(recs)} 份；筛查未通过 {sum(1 for r in recs if r.get("kind")=="screenout")} 份；无连接码的记录 {len(unpaired)} 份',
          f'连接码 {len(rows)} 个：有 D0 {n_d0}，有主要结局（D+1 花园）{n_prim}，有回访 {n_fu}',
          f'D+1 回来率（有 D0 者中有主要结局）：{(n_prim / n_d0 * 100) if n_d0 else 0:.1f}%',
          f'间隔 < 12 小时：{sum(1 for r in rows if r["flag_gap_lt12"])}；18–30 小时（敏感性子样本）：{sum(1 for r in rows if r["in_sensitivity_18_30"])}',
          f'分组来源非 datapipe：{sum(1 for r in rows if r.get("assign_source") not in (None, "datapipe"))}',
          f'安全标记（人工联系）：{sum(1 for r in rows if r.get("safety_contact"))}；支持文字：{sum(1 for r in rows if r.get("safety_support"))}'] + report
open(os.path.join(OUT, 'pairing_report.txt'), 'w', encoding='utf-8').write('\n'.join(report) + '\n')
print('\n'.join(report))
