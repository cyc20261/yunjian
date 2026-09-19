/* 云笺 · 免费体验中转（Cloudflare Pages Function）
 * 路由：POST /v1/chat/completions（与站点同域，无跨域/可达性问题）
 * Key 保存在 Pages 项目的私密环境变量 DEEPSEEK_KEY 中，前端永远拿不到明文。
 * 配置：npx wrangler pages secret put DEEPSEEK_KEY --project-name yunjian
 * 限制：单设备（IP 哈希）1 次 · 全局每日上限 · 单次 4000 字符 · max_tokens 700 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
  // 防外站盗刷：仅允许云笺页面来源
  const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
  const okOrigin = /https:\/\/([a-z0-9-]+\.)?yunjian-8ge\.pages\.dev|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(origin)
    || (env.ALLOW_ORIGIN && new RegExp(env.ALLOW_ORIGIN, 'i').test(origin));
  if (!okOrigin) return json({ error: { message: '本试用通道仅供云笺页面使用' } }, 403);

  // 全局每日上限（防整体被薅）
  const day = new Date().toISOString().slice(0, 10);
  const dayKey = 'day-' + day;
  const dayCount = Number((await env.TRIAL.get(dayKey)) || 0);
  const dailyLimit = Number(env.DAILY_LIMIT) || 100;
  if (dayCount >= dailyLimit) {
    return json({ error: { message: `今日免费体验名额已用完（上限 ${dailyLimit} 次），请填入自己的 DeepSeek API Key，或使用本地 Ollama 模式（完全免费）` } }, 429);
  }

  // 单网络（IP 哈希）限次：同一 WiFi / 出口下多台设备共享 3 次体验名额
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + ':' + (env.SALT || 'yunjian-trial')));
  const ipHash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const ipKey = 'ip-' + ipHash;
  const usedCount = Number((await env.TRIAL.get(ipKey)) || 0);
  const ipLimit = Number(env.IP_LIMIT) || 9; // 默认 9 = 同一网络下 3 台设备 × 各 3 次
  if (usedCount >= ipLimit) {
    return json({ error: { message: `这个网络下的免费体验名额（${ipLimit} 次）已用完～ 填入 DeepSeek API Key 或切换本地 Ollama 模式即可无限使用` } }, 429);
  }

  // 长度限制
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: { message: '请求格式错误' } }, 400); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 3) : [];
  const totalLen = messages.reduce((a, m) => a + String(m.content || '').length, 0);
  if (!messages.length || totalLen === 0) return json({ error: { message: '缺少要处理的内容' } }, 400);
  if (totalLen > 4000) return json({ error: { message: `免费体验单次限 4000 字以内（当前 ${totalLen} 字），请先「⚡ 瘦身」或截取部分内容` } }, 413);

  // 记账（防并发薅），上游失败时回滚计数
  await env.TRIAL.put(ipKey, String(usedCount + 1));

  let upstream;
  try {
    upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.DEEPSEEK_KEY,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        stream: body.stream === true,
        max_tokens: 700,
        temperature: 1.2,
      }),
    });
  } catch (e) {
    await env.TRIAL.put(ipKey, String(usedCount)); // 回滚到原计数
    return json({ error: { message: '体验通道上游连接失败，请稍后再试' } }, 502);
  }

  if (!upstream.ok) {
    await env.TRIAL.put(ipKey, String(usedCount)); // 没消费成功不扣次数
      let detail = '';
      try { const j = await upstream.json(); detail = j.error?.message || ''; } catch (e) { /* ignore */ }
      if (upstream.status === 401) {
        return json({ error: { message: '体验通道未配置有效的 API Key：站长请双击 configure-trial.bat 重新配置' } }, 502);
      }
      if (upstream.status === 402) {
        return json({ error: { message: '体验账户余额不足：站长请给 DeepSeek 账户充值，或临时关闭免费体验' } }, 502);
      }
      return json({ error: { message: `体验通道错误（HTTP ${upstream.status}）${detail ? '：' + detail.slice(0, 120) : ''}` } }, upstream.status);
    }

  await env.TRIAL.put(dayKey, String(dayCount + 1), { expirationTtl: 90000 });
  const headers = {
    ...CORS,
    'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    'X-Trial-Used': '1',
  };
  return new Response(upstream.body, { status: 200, headers });
}
