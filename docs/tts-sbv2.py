#!/usr/bin/env python3
"""使いかた動画の ナレーションを、自然な 日本語の 声で 作る（Style-Bert-VITS2・この 端末の 中だけで うごく）。

docs/make-tour.py が 台本の "voice": "sbv2" の ときに よぶ。まだ 作って いない 文だけを まとめて わたされる
（モデルの 読みこみに 時間が かかるので、1 回 よんで ぜんぶ 作る）。

    標準入力：[{"text": "...", "out": "docs/.tour-voice/xxxx.wav"}, ...]
    出力：    48 kHz・モノラル・16 bit の wav（make-tour.py の SR と 同じ）

声：Style-Bert-VITS2 の JVNV コーパス モデル（litagin/style_bert_vits2_jvnv・**CC BY-SA 4.0**）。
動画の さいごと 台本に クレジットを 入れる こと。モデルと BERT は Hugging Face から 1 回だけ 落として キャッシュに のこる。
外の サービスに 文を 送らない（ぜんぶ この 端末の 中）。

用意（1 回だけ）：
    python3 -m venv ~/.venvs/sbv2 && ~/.venvs/sbv2/bin/pip install torch style-bert-vits2
    台本に "audio": true, "voice": "sbv2" を 書き、SBV2_PYTHON（無ければ ~/.venvs/sbv2/bin/python）で よばれる。
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

MODEL_REPO = os.environ.get("SBV2_REPO", "litagin/style_bert_vits2_jvnv")
MODEL = os.environ.get("SBV2_MODEL", "jvnv-F1-jp")            # 女性・JP-Extra（いちばん 自然）
STYLE = os.environ.get("SBV2_STYLE", "Neutral")
LENGTH = float(os.environ.get("SBV2_LENGTH", "0.95"))          # 1 より 小さいと すこし はやく 読む
BERT = "ku-nlp/deberta-v2-large-japanese-char-wwm"
SR_OUT = 48000


def main():
    jobs = json.load(sys.stdin)
    if not jobs:
        return
    from huggingface_hub import hf_hub_download, list_repo_files
    from style_bert_vits2.constants import Languages
    from style_bert_vits2.nlp import bert_models
    from style_bert_vits2.tts_model import TTSModel
    import numpy as np

    files = [f for f in list_repo_files(MODEL_REPO) if f.startswith(MODEL + "/")]
    pick = lambda end: hf_hub_download(MODEL_REPO, next(f for f in files if f.endswith(end)))
    bert_models.load_model(Languages.JP, BERT).float()   # transformers 5 は 保存された 型（半分の 精度）で 読むので、CPU 用に もどす
    bert_models.load_tokenizer(Languages.JP, BERT)
    model = TTSModel(model_path=pick(".safetensors"), config_path=pick("config.json"), style_vec_path=pick("style_vectors.npy"), device="cpu")
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
    for i, job in enumerate(jobs, 1):
        sr, audio = model.infer(text=job["text"], language=Languages.JP, style=STYLE, length=LENGTH)
        audio = np.asarray(audio)
        if audio.dtype != np.int16:
            audio = np.clip(audio * (32767 if np.abs(audio).max() <= 1.0 else 1), -32768, 32767).astype(np.int16)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            raw = tmp.name
        with wave.open(raw, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(audio.tobytes())
        os.makedirs(os.path.dirname(job["out"]) or ".", exist_ok=True)
        part = job["out"] + ".part.wav"
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", raw, "-ar", str(SR_OUT), "-ac", "1", "-sample_fmt", "s16", part], check=True)
        os.replace(part, job["out"]); os.unlink(raw)
        print(f"  voice {i}/{len(jobs)}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
