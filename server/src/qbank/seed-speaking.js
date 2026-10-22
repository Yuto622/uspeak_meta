// 面接カード（interview-bank.json）と 話すの館（eiken-bank.json）の 問題を、問題データベース（/admin/qbank）の 行に する。
// 起動の とき QBankStore.seed() で 1 回だけ 足す（SEED_TAG を かえると もう 1 回）。答えは サーバーの 中だけ（qbank.json）。
import { readFileSync } from 'node:fs';
import { INTERVIEW_BANK_PATH } from '../game/interview.js';
import { BANK_PATH } from '../game/eiken.js';

export const SEED_TAG = 'speaking-2026-10';
const JA = { g5: '5級', g4: '4級', g3: '3級', gp2: '準2級', g2: '2級', gp1: '準1級以上', g1: '1級' };
const KIND = { passage: 'パッセージの質問', picture: 'イラストの質問', self: '受験者自身の質問', narrate: 'イラストの説明（ナレーション）', opinion: '意見と理由', speech: 'スピーチ' };
const LICENSE = 'U-Speak Lab オリジナル（CC BY 4.0）';
// 文から 短い 印（ID 用）。同じ 文なら いつも 同じ。
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };

export function speakingRows({ interviewFile = INTERVIEW_BANK_PATH, bankFile = BANK_PATH } = {}) {
  const iv = JSON.parse(readFileSync(interviewFile, 'utf8')).grades;
  const eb = JSON.parse(readFileSync(bankFile, 'utf8')).grades;
  const rows = [];
  for (const [g, src] of Object.entries(iv)) {
    if (!JA[g]) continue;
    for (const card of src.cards) {
      const head = card.passage ? `${card.title || ''}: ${card.passage}` : (card.title || '');
      card.steps.forEach((st, i) => {
        rows.push({
          id: `IV-${card.id}-${i + 1}`, grade: JA[g], skill: 'speaking', format: '二次試験（面接）',
          passage: (head + (st.scene ? `\n【イラスト】${st.scene}` : '')).trim(),
          question: `No.${i + 1} ${st.q}（${st.ja}）`, answer: st.model, model_answer: st.model, explanation: st.hint || '',
          tags: [KIND[st.kind], st.minWords ? `${st.minWords}語以上` : '', card.noRead ? '音読なし' : ''].filter(Boolean).join(' '),
          source: `web版：面接の練習（interview-bank.json）・${LICENSE}`, on: true, web: true, roblox: false,
        });
      });
    }
  }
  for (const [g, src] of Object.entries(eb)) {
    if (!JA[g]) continue;
    for (const it of src.speaking || []) {
      rows.push({ id: `SP-${g}-${hash(it.en)}`, grade: JA[g], skill: 'speaking', format: 'スピーキング（言ってみよう）',
        question: it.ja, answer: it.en, model_answer: it.en, source: 'web版：英検の島（eiken-bank.json）', on: true, web: true, roblox: false });
    }
  }
  return rows;
}
