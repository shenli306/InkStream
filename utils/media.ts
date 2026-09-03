import type { VideoFile } from '../hooks/useMediaLibrary';

export interface VideoGroup {
  label: string;
  videos: VideoFile[];
}

export const groupVideosByTime = (videos: VideoFile[], now = new Date()): VideoGroup[] => {
  const groups: Record<string, VideoFile[]> = {};
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const thisWeek = today - 86400000 * 7;
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  videos.forEach(video => {
    const timestamp = new Date(video.time).getTime();
    let label = '更早以前';
    if (timestamp >= today) label = '今天';
    else if (timestamp >= yesterday) label = '昨天';
    else if (timestamp >= thisWeek) label = '本周';
    else if (timestamp >= thisMonth) label = '本月';
    (groups[label] ||= []).push(video);
  });

  return ['今天', '昨天', '本周', '本月', '更早以前']
    .map(label => ({ label, videos: groups[label] || [] }))
    .filter(group => group.videos.length > 0);
};
