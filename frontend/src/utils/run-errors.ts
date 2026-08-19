/**
 * 工作流运行失败文案：上游原始错误 → 可读原因 + 建议
 */

export type FriendlyError = {
  /** 给人看的主因 */
  reason: string;
  /** 可操作建议（可空） */
  tip?: string;
  /** 清理后的原文（去掉 Request id 等噪音） */
  raw: string;
};

function cleanRaw(msg: string) {
  return String(msg || '')
    .replace(/\s*Request id:\s*\S+/gi, '')
    .replace(/\s*requestId[=:]\s*\S+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 将上游错误翻译成可读原因；无法识别时仍返回清理后的原文。
 */
export function explainRunError(raw?: string): FriendlyError {
  const msg = cleanRaw(String(raw || '').trim());
  if (!msg) {
    return { reason: '未知错误', tip: '可点「刷新」或「重试」；仍失败请查看展开后的原文。', raw: '' };
  }

  const hit = (
    reason: string,
    tip?: string,
  ): FriendlyError => ({ reason, tip, raw: msg });

  if (/real person|contain real people|may contain real person/i.test(msg)) {
    return hit(
      '视频被内容安全拒绝：首/尾帧疑似含真人',
      '请改成动漫/插画风格，或换不含真人的参考图后再试。',
    );
  }
  if (
    /InputImageSensitiveContentDetected|InputTextSensitiveContentDetected|sensitive.?content|sensitive information|input text may contain sensitive/i.test(
      msg,
    )
  ) {
    return hit('内容安全审核未通过', '请修改提示词或参考图后重试。');
  }
  if (/SignatureDoesNotMatch|not match the signature/i.test(msg)) {
    return hit('存储签名校验失败', '请稍后重试，或联系管理员检查存储配置。');
  }
  if (/对象存储未配置|FileOSS 未配置|FILE_OSS_REQUIRED|MinIO/i.test(msg) && /未配置|不可用|配置/i.test(msg)) {
    return hit('存储服务暂不可用', '请稍后重试。');
  }
  if (/fetchRemote|素材入库|未能入库|persistMedia|keep source/i.test(msg)) {
    return hit('媒体保存失败', '请稍后重试。');
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|fetch failed|socket hang up/i.test(msg)) {
    return hit('网络请求失败', '请检查本机网络、上游 API 与对象存储是否可达后重试。');
  }
  if (/参考.*(无法|不能|不可).*访问|image.*(invalid|unreachable|download)|下载.*(失败|超时)/i.test(msg)) {
    return hit('参考图/视频无法被上游访问', '请确认资源已入库对象存储且为公网可读直链。');
  }
  if (/本机地址|localhost|127\.0\.0\.1|豆包无法访问/i.test(msg)) {
    return hit('参考媒体是本机地址，上游无法访问', '请先上传到项目资产（对象存储）再引用。');
  }
  if (/运行超时|RUN_TIMEOUT|timeout|timed out/i.test(msg)) {
    return hit('运行超时', '可点「重试」；视频生成较慢时可稍后再试。');
  }
  if (/status code 401|Unauthorized|invalid.?api.?key|Incorrect API key/i.test(msg)) {
    return hit('鉴权失败', '请到后台检查对应渠道的 API Key 是否已配置且有效。');
  }
  if (/status code 403|AccessDenied|not authorized|无权限/i.test(msg)) {
    return hit('无权限调用该模型或资源', '请确认已在对应平台开通模型，且密钥有权限。');
  }
  if (/status code 404|model.?not.?found|NotFound/i.test(msg)) {
    return hit('模型或资源不存在', '请在节点里换一个可用模型，或到后台核对渠道与模型配置。');
  }
  if (/status code 429|rate limit|Too Many Requests|配额|quota/i.test(msg)) {
    return hit('请求过于频繁或配额不足', '请稍后再试，或检查上游账户额度。');
  }
  if (/status code 503|service unavailable|过载|繁忙/i.test(msg)) {
    return hit('上游暂时繁忙（503）', '请稍后重试，一般无需改配置。');
  }
  if (/status code 400/i.test(msg)) {
    if (/火山|视频|真人|首.?帧|尾.?帧/i.test(msg)) {
      return hit(msg.length > 160 ? `${msg.slice(0, 160)}…` : msg, '多为首/尾帧或提示词不合规，请调整后重试。');
    }
    return hit('请求被拒绝（400）', '多为参数不合规、参考图无法访问，或模型未开通。可展开查看原文。');
  }
  if (/status code 5\d{2}/i.test(msg)) {
    return hit('上游服务异常', '请稍后重试；若持续失败请换模型或检查渠道状态。');
  }
  if (/JSON|Unexpected token|parse/i.test(msg) && /error|失败|invalid/i.test(msg)) {
    return hit('上游返回内容解析失败', '可重试该节点；若反复出现请换模型。');
  }
  if (/取消|cancelled|aborted|AbortError/i.test(msg)) {
    return hit('任务已取消', undefined);
  }

  // 历史数据里常见：后端只存了空壳「出图失败」，没有上游原文
  if (/^(出图失败|封面出图失败|生图失败|AI 生图失败)$/.test(msg)) {
    return {
      reason: '出图失败（上游未返回具体原因）',
      tip: '请重启后端后再重试该节点；新版本会写入 HTTP 状态、请求地址与上游原文。常见原因：默认模型渠道额度/权限、尺寸不支持、Hub 网关空响应。',
      raw: msg,
    };
  }

  // 无法归类：尽量缩短超长英文堆栈，提示可看原文
  const short =
    msg.length > 220 ? `${msg.slice(0, 220).trim()}…` : msg;
  const looksEnglish = /^[\x00-\x7F]+$/.test(msg) && /[A-Za-z]{8,}/.test(msg);
  return {
    reason: looksEnglish ? `上游返回错误（可展开看原文）` : short,
    tip: looksEnglish ? short : undefined,
    raw: msg,
  };
}

/** 兼容旧调用：只返回原因字符串 */
export function friendlyError(raw?: string): string {
  return explainRunError(raw).reason;
}
