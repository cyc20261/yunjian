/* 云笺 · 云端语音转写兜底（Cloudflare Pages Function + Workers AI Whisper）
 * 场景：线上访客（尤其手机）没有本机 faster-whisper 服务时，录音自动走云端转写。
 * 限流：同 IP 每日 10 次防滥用；单文件 25MB 上限。
 * 返回：{ text }（无时间轴；前端已兼容无 segments 的结果） */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
  const okOrigin = /https:\/\/([a-z0-9-]+\.)?yunjian-8ge\.pages\.dev|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(origin)
    || (env.ALLOW_ORIGIN && new RegExp(env.ALLOW_ORIGIN, 'i').test(origin));
  if (!okOrigin) return json({ error: { message: '本通道仅供云笺页面使用' } }, 403);

  // 限流：同 IP 每日 10 次云端转写
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + ':transcribe'));
  const ipHash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const day = new Date().toISOString().slice(0, 10);
  const key = 'tr-' + day + '-' + ipHash;
  const used = Number((await env.TRIAL.get(key)) || 0);
  if (used >= 10) {
    return json({ error: { message: '今日云端转写次数已用完（10 次/天）。电脑端可运行本地转写服务（免费无限）' } }, 429);
  }

  const audioBuf = await request.arrayBuffer();
  if (!audioBuf.byteLength) return json({ error: { message: '缺少音频数据' } }, 400);
  if (audioBuf.byteLength > 25 * 1024 * 1024) return json({ error: { message: '音频超过 25MB，请截取或压缩后再试' } }, 413);

  let result;
  try {
    result = await env.AI.run('@cf/openai/whisper', {
      audio: [...new Uint8Array(audioBuf)],
    });
  } catch (e) {
    return json({ error: { message: '云端转写失败：' + String(e.message || e).slice(0, 120) } }, 502);
  }

  const text = String(result?.text || '').trim();
  if (!text) return json({ error: { message: '没有识别到有效语音内容' } }, 422);

  await env.TRIAL.put(key, String(used + 1), { expirationTtl: 90000 });
  return json({ text, model: '@cf/openai/whisper' });
}
