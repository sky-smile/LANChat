export function formatTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  // 今天内
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth()) {
    return `昨天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }

  // 今年内
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  // 更早
  return d.toLocaleDateString('zh-CN');
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * 获取文件/缩略图的完整 URL
 * 生产环境使用 VITE_API_URL 拼接，开发环境使用相对路径
 */
export function getFileUrl(fileId: string, type?: 'thumbnail'): string {
  const suffix = type === 'thumbnail' ? '/thumbnail' : '';
  const path = `/api/storage/${fileId}${suffix}`;
  
  if (import.meta.env.DEV) {
    return path;
  }
  
  const apiUrl = import.meta.env.VITE_API_URL;
  return apiUrl ? `${apiUrl}${path}` : path;
}
