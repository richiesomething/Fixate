# Transcribe one LibriVox chapter file with word timestamps -> json [[word,start,end],...]
import sys, json, time, subprocess
import numpy as np
from faster_whisper import WhisperModel
model_name, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
m = WhisperModel(model_name, device='cpu', compute_type='int8', cpu_threads=int(sys.argv[4]) if len(sys.argv) > 4 else 4)
t0 = time.time()
pcm = subprocess.run(['ffmpeg','-nostdin','-loglevel','error','-i',src,'-ac','1','-ar','16000','-f','s16le','-'],capture_output=True,check=True).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
segs, info = m.transcribe(audio, language='en', word_timestamps=True, beam_size=1, vad_filter=False, condition_on_previous_text=False)
words = [[w.word.strip(), round(w.start, 3), round(w.end, 3)] for s in segs for w in s.words]
json.dump({'dur': info.duration, 'words': words}, open(out, 'w'))
print(f'{src}: {info.duration:.0f}s audio in {time.time()-t0:.0f}s, {len(words)} words', flush=True)
