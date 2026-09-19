/* =====================================================
 * 云笺 · 视频一键剪辑（本地 ffmpeg.wasm）
 * 所有处理都在本机浏览器内完成，视频不会上传到任何服务器
 * ===================================================== */
'use strict';

const V_ACCEPT = 'video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.m4v,.mts,.ts,.3gp,ogv';

const V = {
  files: [],        // [{ file, name, base, ext, size, url, duration }]
  activeIdx: 0,
  speed: 1.5,
  rotate: '90',     // 90 | 180 | 270 | hflip
  ffmpeg: null,
  enginePromise: null,
  busy: false,
  cancelled: false,
  result: null,     // { blob, name, kind, size }
  outUrl: null,
};

/* ---------- 小工具 ---------- */

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '--';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/* 支持「90」「1:30」「1:02:03」三种写法 → 秒 */
function parseTime(str) {
  const m = String(str ?? '').trim().match(/^(?:(\d+):)?(?:([0-5]?\d):)?([0-5]?\d(?:\.\d{1,2})?)$/);
  if (!m) return null;
  const h = Number(m[1] || 0), mi = Number(m[2] || 0), s = Number(m[3] || 0);
  if (m[2] === undefined && m[1] !== undefined && !m[3]) return null;
  return h * 3600 + mi * 60 + s;
}

function activeFile() { return V.files[V.activeIdx] || null; }

function totalDuration() { return V.files.reduce((a, f) => a + (f.duration || 0), 0); }

/* 当前截取范围（秒）；无输入或无效返回 null */
function trimRange() {
  const f = activeFile();
  if (!f || !f.duration) return null;
  const sRaw = $('vStart').value, eRaw = $('vEnd').value;
  if (!sRaw.trim() && !eRaw.trim()) return null;
  const s = sRaw.trim() ? parseTime(sRaw) : 0;
  const e = eRaw.trim() ? parseTime(eRaw) : f.duration;
  if (s === null || e === null) return null;
  if (s < 0 || e <= s || e > f.duration + 0.5) return null;
  return { start: s, end: Math.min(e, f.duration), dur: Math.min(e, f.duration) - s };
}

/* ---------- 文件管理 ---------- */

function isVideoFile(file) {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|flv|m4v|mts|ts|3gp|ogv)$/i.test(file.name);
}

async function addFiles(fileList) {
  const arr = [...fileList].filter(isVideoFile);
  const bad = fileList.length - arr.length;
  if (bad > 0) toast(`已跳过 ${bad} 个非视频文件`);
  if (!arr.length) return;

  for (const file of arr) {
    if (file.size > 300 * 1024 * 1024) toast(`「${file.name}」超过 300MB，可能超出浏览器内存限制，请留意`);
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, 'mp4'])[1].toLowerCase();
    const item = {
      file,
      name: file.name,
      base: file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?"<>|]/g, '_') || 'video',
      ext,
      size: file.size,
      url: URL.createObjectURL(file),
      duration: 0,
    };
    V.files.push(item);
    // 用临时 video 探测时长（失败不阻塞，仅影响进度显示）
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = item.url;
    await new Promise((r) => {
      probe.onloadedmetadata = () => { item.duration = probe.duration || 0; r(); };
      probe.onerror = r;
      setTimeout(r, 4000);
    });
  }
  V.activeIdx = V.files.length - arr.length;
  renderVFiles();
  toast(`已添加 ${arr.length} 个视频`);
  if (typeof renderTips === 'function') renderTips();
}

function removeFile(i) {
  URL.revokeObjectURL(V.files[i].url);
  V.files.splice(i, 1);
  if (!V.files.length) { resetVideoUI(); return; }
  if (V.activeIdx >= V.files.length) V.activeIdx = V.files.length - 1;
  renderVFiles();
}

/* 调整拼接顺序：dir=-1 左移 / +1 右移 */
function moveFile(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= V.files.length) return;
  [V.files[i], V.files[j]] = [V.files[j], V.files[i]];
  if (V.activeIdx === i) V.activeIdx = j;
  else if (V.activeIdx === j) V.activeIdx = i;
  renderVFiles();
}

/* 把上一次处理结果作为新输入，继续叠加操作（如 先截取 → 再压缩） */
function useResultAsInput() {
  const r = V.result;
  if (!r) return;
  const dot = r.name.lastIndexOf('.');
  const ext = r.name.slice(dot + 1).toLowerCase();
  const item = {
    file: new File([r.blob], r.name, { type: r.blob.type }),
    name: r.name,
    base: r.name.slice(0, dot > 0 ? dot : undefined).replace(/[\\/:*?"<>|]/g, '_') || 'video',
    ext: ext || 'mp4',
    size: r.blob.size,
    url: URL.createObjectURL(r.blob),
    duration: 0,
  };
  // 探测结果时长
  const probe = document.createElement('video');
  probe.preload = 'metadata';
  probe.src = item.url;
  probe.onloadedmetadata = () => { item.duration = probe.duration || 0; renderVFiles(); };
  V.files.push(item);
  V.activeIdx = V.files.length - 1;
  clearVResult();
  renderVFiles();
  toast('已把处理结果加入文件列表，可继续叠加操作');
}

function resetVideoUI() {
  V.files.forEach((f) => URL.revokeObjectURL(f.url));
  V.files = [];
  V.activeIdx = 0;
  clearVResult();
  $('vFileBar').classList.add('hidden');
  $('vMain').classList.add('hidden');
  $('vDrop').classList.remove('hidden');
}

/* ---------- 引擎 ---------- */

function setVProgress(on, text, pct) {
  $('vProgress').classList.toggle('hidden', !on);
  if (text != null) $('vStatusText').textContent = text;
  const fill = $('vBarFill');
  fill.classList.toggle('indeterminate', pct == null);
  fill.style.width = pct != null ? `${Math.min(100, Math.max(2, pct * 100)).toFixed(1)}%` : '0%';
  $('vCancel').classList.toggle('hidden', !V.busy);
}

function ensureEngine() {
  if (V.ffmpeg) return Promise.resolve(V.ffmpeg);
  if (V.enginePromise) return V.enginePromise;
  V.enginePromise = (async () => {
    setVProgress(true, '正在加载视频处理引擎（本地组件，仅首次稍慢）…', null);
    // 优先用随包自带的内核（完整下载版秒加载）；线上轻量包未含 31MB 内核时回退公共 CDN
    const CDN = [
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
      'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
    ];
    let ff = null, lastErr = null;
    const attempts = [{ coreURL: 'vendor/ffmpeg/ffmpeg-core.js', wasmURL: 'vendor/ffmpeg/ffmpeg-core.wasm' },
      ...CDN.map(base => ({ coreURL: base + '/ffmpeg-core.js', wasmURL: base + '/ffmpeg-core.wasm' }))];
    for (const urls of attempts) {
      try {
        ff = new FFmpegWASM.FFmpeg();
        ff.on('progress', ({ progress }) => {
          if (V.busy && progress > 0 && progress <= 1) {
            const pct = progress > 0.999 ? 1 : progress;
            setVProgress(true, null, pct);
            $('vStatusText').textContent = '处理中…';
          }
        });
        await ff.load(urls);
        V.ffmpeg = ff;
        return ff;
      } catch (e) { lastErr = e; if (ff) ff.terminate?.(); }
    }
    throw new Error('视频引擎加载失败（本地内核缺失且 CDN 不可达）：' + (lastErr?.message || lastErr));
  })();
  V.enginePromise.catch(() => { V.enginePromise = null; setVProgress(false); });
  return V.enginePromise;
}

/* ---------- 一键操作 ---------- */

const V_OPS = {
  compress: { icon: '🗜️', title: '压缩瘦身', desc: '重新编码，通常可省 40%～70% 空间' },
  trim:     { icon: '✂️', title: '截取片段', desc: '按左侧起点 / 终点截取为 MP4' },
  gif:      { icon: '🎞️', title: '生成 GIF', desc: '截取范围（未设则取前 5 秒）转 GIF' },
  mp3:      { icon: '🎵', title: '提取音频', desc: '导出为 MP3（设有截取范围时只导该段）' },
  mute:     { icon: '🔇', title: '去除声音', desc: '去掉音轨、画面不变，几乎秒完成' },
  speed:    { icon: '⏩', title: '变速播放', desc: '按上方倍率加速 / 减速（导出 MP4）' },
  rotate:   { icon: '🔄', title: '旋转画面', desc: '按上方选择旋转 90°/180°/270° 或镜像' },
  reverse:  { icon: '◀️', title: '视频倒放', desc: '画面与声音同时倒序播放（导出 MP4）' },
  scale:    { icon: '🖼️', title: '改分辨率', desc: '导出为 720p 通用 MP4，文件更小' },
  text:     { icon: '🏷️', title: '加文字水印', desc: '在左上角叠加文字（在「补充要求」里填写）' },
  tomp4:    { icon: '📥', title: '转成 MP4', desc: 'WebM / MOV / MKV 等转为通用 MP4' },
  merge:    { icon: '➕', title: '拼接合并', desc: '把文件列表中的多个视频按顺序接成一个' },
};

function opEnabled(id) {
  if (V.busy) return false;
  const f = activeFile();
  if (id === 'merge') return V.files.length >= 2;
  if (!f) return false;
  if (id === 'trim') return !!trimRange();
  if (id === 'tomp4') return f.ext !== 'mp4';
  return true;
}

function buildArgs(id) {
  const f = activeFile();
  const range = trimRange();
  switch (id) {
    case 'compress':
      return { inputs: [f], out: `${f.base}_压缩.mp4`, dur: f.duration,
        args: ['-i', 'in_0.' + f.ext, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', 'out.mp4'] };
    case 'trim': {
      const r = range;
      return { inputs: [f], out: `${f.base}_片段.mp4`, dur: r.dur,
        args: ['-ss', r.start.toFixed(2), '-t', r.dur.toFixed(2), '-i', 'in_0.' + f.ext, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', 'out.mp4'] };
    }
    case 'gif': {
      const gifDur = range ? range.dur : Math.min(5, f.duration || 5);
      const ss = range ? ['-ss', range.start.toFixed(2)] : [];
      return { inputs: [f], out: `${f.base}.gif`, dur: gifDur,
        args: [...ss, '-t', gifDur.toFixed(2), '-i', 'in_0.' + f.ext,
          '-filter_complex', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer',
          'out.gif'] };
    }
    case 'mp3': {
      const ss = range ? ['-ss', range.start.toFixed(2), '-t', range.dur.toFixed(2)] : [];
      return { inputs: [f], out: `${f.base}.mp3`, dur: range ? range.dur : f.duration,
        args: [...ss, '-i', 'in_0.' + f.ext, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', 'out.mp3'] };
    }
    case 'mute':
      return { inputs: [f], out: `${f.base}_静音.${f.ext}`, dur: 0,
        args: ['-i', 'in_0.' + f.ext, '-an', '-c:v', 'copy', 'out.' + f.ext] };
    case 'speed': {
      const sp = V.speed;
      return {
        inputs: [f], out: `${f.base}_${sp}x.mp4`, dur: (f.duration || 0) / sp,
        tryAV: {
          args: ['-i', 'in_0.' + f.ext,
            '-filter_complex', `[0:v]setpts=PTS/${sp}[v];[0:a]atempo=${sp}[a]`, '-map', '[v]', '-map', '[a]',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', 'out.mp4'],
        },
        args: ['-i', 'in_0.' + f.ext,
          '-filter_complex', `[0:v]setpts=PTS/${sp}[v]`, '-map', '[v]', '-an',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', 'out.mp4'],
      };
    }
    case 'tomp4':
      return { inputs: [f], out: `${f.base}.mp4`, dur: f.duration,
        args: ['-i', 'in_0.' + f.ext, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'out.mp4'] };
    case 'rotate': {
      const vf = V.rotate === 'hflip' ? 'hflip' : `transpose=${{ 90: 1, 180: undefined, 270: 2 }[V.rotate]}`;
      const filter = V.rotate === '180' ? 'transpose=2,transpose=2' : vf;
      const suffix = V.rotate === 'hflip' ? '镜像' : `旋转${V.rotate}度`;
      return { inputs: [f], out: `${f.base}_${suffix}.mp4`, dur: f.duration,
        tryAV: {
          args: ['-i', 'in_0.' + f.ext, '-vf', filter,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', 'out.mp4'],
        },
        args: ['-i', 'in_0.' + f.ext, '-vf', filter,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-an', 'out.mp4'] };
    }
    case 'reverse':
      return { inputs: [f], out: `${f.base}_倒放.mp4`, dur: f.duration,
        tryAV: {
          args: ['-i', 'in_0.' + f.ext, '-vf', 'reverse', '-af', 'areverse',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', 'out.mp4'],
        },
        args: ['-i', 'in_0.' + f.ext, '-vf', 'reverse',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-an', 'out.mp4'] };
    case 'scale':
      return { inputs: [f], out: `${f.base}_720p.mp4`, dur: f.duration,
        args: ['-i', 'in_0.' + f.ext,
          '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
          '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-c:a', 'aac', '-b:a', '128k', 'out.mp4'] };
    case 'text': {
      const label = ($('extraReq')?.value || '').trim().slice(0, 30);
      if (!label) { toast('请先在上方「补充要求」里输入水印文字'); return null; }
      const safe = label.replace(/[\\':,%]/g, ' ').replace(/"/g, "'");
      return { inputs: [f], out: `${f.base}_水印.mp4`, dur: f.duration,
        args: ['-i', 'in_0.' + f.ext,
          '-vf', `drawbox=x=0:y=0:w=iw:h=48:color=black@0.45:t=fill,drawtext=text='${safe}':x=16:y=14:fontsize=22:fontcolor=white`,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', 'out.mp4'],
        failMsg: '文字水印需要引擎支持字体渲染，当前引擎不支持。可先用其他操作处理，或改用视频剪辑软件添加水印' };
    }
    case 'merge': {
      const n = V.files.length;
      const ins = [];
      V.files.forEach((_, i) => ins.push('-i', `in_${i}.${V.files[i].ext}`));
      return {
        inputs: V.files, out: `合并_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.mp4`, dur: totalDuration(),
        tryAV: {
          args: [...ins, '-filter_complex', `concat=n=${n}:v=1:a=1[v][a]`, '-map', '[v]', '-map', '[a]',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-c:a', 'aac', '-b:a', '128k', 'out.mp4'],
        },
        args: [...ins, '-filter_complex', `concat=n=${n}:v=1:a=0[v]`, '-map', '[v]',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', 'out.mp4'],
      };
    }
  }
}

async function runOp(id) {
  if (V.busy) return;
  if (!V.files.length) { toast('请先添加视频文件'); return; }
  if (id !== 'merge' && !activeFile()) { toast('请先选择一个视频'); return; }
  if (id === 'trim' && !trimRange()) { toast('请先在左侧填写有效的起点 / 终点'); return; }

  const spec = buildArgs(id);
  if (!spec) return;

  V.busy = true;
  V.cancelled = false;
  renderVOps();
  clearVResult();
  setVProgress(true, '准备中…', null);
  const t0 = Date.now();

  try {
    const ff = await ensureEngine();
    if (V.cancelled) return;

    // 写入输入文件
    for (let i = 0; i < spec.inputs.length; i++) {
      const f = spec.inputs[i];
      await ff.writeFile(`in_${i}.${f.ext}`, new Uint8Array(await f.file.arrayBuffer()));
    }

    setVProgress(true, V_OPS[id].title + '处理中…', spec.dur ? 0.02 : null);
    let code = await ff.exec(spec.args);

    // 声音相关参数在没有音轨的视频上会失败：降级为纯视频重试
    if (code !== 0 && spec.tryAV) {
      code = await ff.exec(spec.tryAV.args);
      if (code === 0) toast('该视频没有音轨，已按纯视频处理');
    }

    // 拼接时分辨率不一致会让 concat 失败：统一缩放到 720p 加黑边重试
    if (code !== 0 && id === 'merge') {
      const n = V.files.length;
      const parts = V.files.map((_, i) =>
        `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`).join(';');
      const chain = V.files.map((_, i) => `[v${i}]`).join('') + `concat=n=${n}:v=1:a=0[v]`;
      code = await ff.exec([...V.files.flatMap((_, i) => ['-i', `in_${i}.${V.files[i].ext}`]),
        '-filter_complex', `${parts};${chain}`, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', 'out.mp4']);
      if (code === 0) toast('各视频分辨率不同，已统一为 1280×720 并加黑边');
    }

    if (V.cancelled) return;
    if (code !== 0) throw new Error(spec.failMsg || '处理失败，请换一种操作或换一个视频试试（部分特殊编码格式不受支持）');

    const data = await ff.readFile(spec.out);
    if (!data || !data.length) throw new Error('没有生成内容');
    const blob = new Blob([data.buffer || data], { type: blobType(spec.out) });
    V.result = { blob, name: spec.name || spec.out, size: blob.size, kind: kindOf(spec.out), srcSize: spec.inputs.reduce((a, f) => a + f.size, 0) };
    renderVResult();
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    toast(`完成！耗时 ${secs} 秒，可直接下载`);
  } catch (err) {
    if (!V.cancelled) {
      setVProgress(false);
      toast('出错：' + (err.message || String(err)));
    }
  } finally {
    // 释放内存中的临时文件
    if (V.ffmpeg && !V.cancelled) {
      try {
        for (let i = 0; i < spec.inputs.length; i++) await V.ffmpeg.deleteFile(`in_${i}.${spec.inputs[i].ext}`);
        await V.ffmpeg.deleteFile(spec.out);
      } catch (e) { /* ignore */ }
    }
    V.busy = false;
    setVProgress(false);
    renderVOps();
  }
}

function blobType(name) {
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}

function kindOf(name) {
  if (name.endsWith('.gif')) return 'image';
  if (name.endsWith('.mp3')) return 'audio';
  return 'video';
}

/* ---------- 渲染 ---------- */

function renderVFiles() {
  const bar = $('vFileBar');
  if (!V.files.length) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.innerHTML = V.files.map((f, i) => `
    <span class="v-file ${i === V.activeIdx ? 'active' : ''}" data-vi="${i}" title="${esc(f.name)}">
      <span class="v-file-order" title="拼接顺序">${i + 1}</span>
      <span class="v-file-name">${esc(f.name.length > 18 ? f.name.slice(0, 16) + '…' : f.name)}</span>
      <em>${fmtSize(f.size)}${f.duration ? ' · ' + fmtDuration(f.duration) : ''}</em>
      ${i > 0 ? `<button class="v-file-move" data-vmove="${i}|-1" title="前移（拼接时排前面）">◀</button>` : ''}
      ${i < V.files.length - 1 ? `<button class="v-file-move" data-vmove="${i}|1" title="后移（拼接时排后面）">▶</button>` : ''}
      <button class="v-file-del" data-vdel="${i}" title="移除">✕</button>
    </span>`).join('');

  const f = activeFile();
  $('vMain').classList.remove('hidden');
  $('vDrop').classList.add('hidden');
  const player = $('vPlayer');
  if (player.dataset.src !== f.url) {
    player.dataset.src = f.url;
    player.src = f.url;
    player.load();
  }
  $('vMeta').textContent = `${f.name} · ${fmtSize(f.size)} · ${f.duration ? fmtDuration(f.duration) : '时长未知'} · 处理时全程留在本机`;
  renderVOps();
}

function renderVOps() {
  $('vOps').innerHTML = Object.entries(V_OPS).map(([id, op]) => {
    const on = opEnabled(id);
    return `<button class="v-op ${on ? '' : 'off'}" data-vop="${id}" ${on ? '' : 'disabled'}>
      <span class="v-op-icon">${op.icon}</span>
      <span class="v-op-title">${op.title}</span>
      <span class="v-op-desc">${op.desc}</span>
    </button>`;
  }).join('');
}

function clearVResult() {
  if (V.outUrl) { URL.revokeObjectURL(V.outUrl); V.outUrl = null; }
  V.result = null;
  $('vResult').classList.add('hidden');
  $('vResult').innerHTML = '';
}

function renderVResult() {
  const r = V.result;
  const box = $('vResult');
  if (!r) { box.classList.add('hidden'); return; }
  V.outUrl = URL.createObjectURL(r.blob);
  const srcSize = r.srcSize || 0;
  const delta = srcSize ? ` · ${fmtSize(srcSize)} → ${fmtSize(r.size)}（${r.size <= srcSize ? '省 ' + Math.round((1 - r.size / srcSize) * 100) + '%' : '增大 ' + Math.round((r.size / srcSize - 1) * 100) + '%'}）` : '';
  const preview = r.kind === 'video' ? `<video src="${V.outUrl}" controls playsinline></video>`
    : r.kind === 'audio' ? `<audio src="${V.outUrl}" controls></audio>`
    : `<img src="${V.outUrl}" alt="GIF 预览">`;
  box.innerHTML = `
    <div class="v-result-head">
      <span class="badge">✅ ${esc(r.name)}</span>
      <span class="v-result-meta">${fmtSize(r.size)}${delta}</span>
      ${r.kind === 'video' ? '<button id="vAddBack" class="ghost-btn small" title="把这次的结果加入文件列表，继续叠加其他处理（如 先截取 → 再压缩）">➕ 继续编辑</button>' : ''}
      <a class="primary-btn small" href="${V.outUrl}" download="${esc(r.name)}">⬇ 下载</a>
    </div>
    <div class="v-result-preview ${r.kind}">${preview}</div>`;
  box.classList.remove('hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- 事件绑定 ---------- */

function initVideoTab() {
  const drop = $('vDrop');
  const input = $('vFileInput');

  $('vAddBtn').addEventListener('click', () => input.click());
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });

  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove('drag');
  }));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

  $('vFileBar').addEventListener('click', (e) => {
    const mv = e.target.closest('[data-vmove]');
    if (mv) { e.stopPropagation(); const [i, d] = mv.dataset.vmove.split('|').map(Number); moveFile(i, d); return; }
    const del = e.target.closest('[data-vdel]');
    if (del) { e.stopPropagation(); removeFile(+del.dataset.vdel); return; }
    const chip = e.target.closest('[data-vi]');
    if (chip) { V.activeIdx = +chip.dataset.vi; renderVFiles(); }
  });

  // 起点终点：手动输入或从播放器当前位置标记
  const refreshRange = () => {
    const r = trimRange();
    $('vRangeInfo').textContent = r ? `将截取 ${r.dur.toFixed(1)} 秒` : '';
    renderVOps();
  };
  ['vStart', 'vEnd'].forEach(id => $(id).addEventListener('input', refreshRange));
  $('vMarkStart').addEventListener('click', () => { $('vStart').value = fmtDuration($('vPlayer').currentTime); refreshRange(); });
  $('vMarkEnd').addEventListener('click', () => { $('vEnd').value = fmtDuration($('vPlayer').currentTime); refreshRange(); });

  $('vSpeedSeg').addEventListener('click', (e) => {
    const seg = e.target.closest('.seg'); if (!seg) return;
    V.speed = Number(seg.dataset.sp);
    $('vSpeedSeg').querySelectorAll('.seg').forEach(s => s.classList.toggle('active', s === seg));
  });

  $('vRotateSeg').addEventListener('click', (e) => {
    const seg = e.target.closest('.seg'); if (!seg) return;
    V.rotate = seg.dataset.rot;
    $('vRotateSeg').querySelectorAll('.seg').forEach(s => s.classList.toggle('active', s === seg));
  });

  $('vOps').addEventListener('click', (e) => {
    const card = e.target.closest('[data-vop]');
    if (card) runOp(card.dataset.vop);
  });

  // 结果区「继续编辑」：把输出作为新输入叠加操作
  $('vResult').addEventListener('click', (e) => {
    if (e.target.closest('#vAddBack')) useResultAsInput();
  });

  $('vCancel').addEventListener('click', () => {
    V.cancelled = true;
    if (V.ffmpeg) { try { V.ffmpeg.terminate(); } catch (e) { /* ignore */ } V.ffmpeg = null; V.enginePromise = null; }
    V.busy = false;
    setVProgress(false);
    renderVOps();
    toast('已取消本次处理');
  });

  // 直接双击 index.html 打开时，浏览器禁止加载处理引擎，提示改用 start.bat
  if (location.protocol === 'file:') {
    $('vDrop').innerHTML = `
      <div class="v-drop-icon">⚠️</div>
      <p>视频剪辑需要通过本地服务器使用</p>
      <p class="v-drop-sub">请双击 <b>start.bat</b> 启动后，在浏览器打开 <b>http://localhost:8787</b> 再使用本功能（其他功能不受影响）</p>`;
    drop.style.pointerEvents = 'none';
    $('vAddBtn').disabled = true;
  }
}

initVideoTab();
