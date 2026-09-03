export const isPlaceholderCoverUrl = (url?: string | null): boolean => {
  if (!url) return true;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {}
  const lower = decoded.toLowerCase();
  return lower.includes("nocover") || lower.includes("no-cover") || lower.includes("nopic") ||
    lower.includes("noimage") || lower.includes("default") || lower.includes("placeholder") ||
    decoded.includes("暂无封面");
};

const PROXY_DOMAINS = [
  "321cdn.com",
  "alicdn.com",
  "taobao.org",
  "alipay.com",
  "doubaocdn.com",
  "aka.doubaocdn.com",
];

export const resolveCoverUrl = (url?: string | null): string | null => {
  if (!url || isPlaceholderCoverUrl(url)) return null;
  if (url.startsWith("/api/")) return url;

  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {}

  const lowerDecoded = decodedUrl.toLowerCase();
  if (PROXY_DOMAINS.some(d => lowerDecoded.includes(d))) {
    return decodedUrl;
  }

  if (url.startsWith("http")) return `/api/proxy?url=${encodeURIComponent(url)}`;
  return url;
};

