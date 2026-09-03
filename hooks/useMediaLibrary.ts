import { useCallback, useState } from 'react';
import { AppState } from '../types';

export interface VideoFile {
  filename: string;
  size: number;
  time: string;
  url: string;
  type?: string;
}

export interface PhotoFolder {
  name: string;
  time: string;
  type?: string;
}

export interface PhotoFile {
  filename: string;
  size: number;
  time: string;
  url: string;
  type?: string;
}

interface UseMediaLibraryOptions {
  setAppState: (state: AppState) => void;
  setError: (message: string | null) => void;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export const useMediaLibrary = ({ setAppState, setError }: UseMediaLibraryOptions) => {
  const [videoResults, setVideoResults] = useState<VideoFile[]>([]);
  const [showVideos, setShowVideos] = useState(false);
  const [videoPage, setVideoPage] = useState(1);
  const [videoSortOrder, setVideoSortOrder] = useState<'desc' | 'asc'>('desc');
  const [videoHasMore, setVideoHasMore] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  const [photoFolders, setPhotoFolders] = useState<PhotoFolder[]>([]);
  const [selectedPhotoFolder, setSelectedPhotoFolder] = useState<string | null>(null);
  const [photoResults, setPhotoResults] = useState<PhotoFile[]>([]);
  const [showPhotos, setShowPhotos] = useState(false);
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [photoPage, setPhotoPage] = useState(1);
  const [photoHasMore, setPhotoHasMore] = useState(false);

  const fetchVideos = useCallback(async (page: number, sort: 'desc' | 'asc', isLoadMore = false) => {
    setIsVideoLoading(true);
    setShowPhotos(false);
    try {
      const response = await fetch(`/api/list-videos?page=${page}&limit=20&sort=${sort}`);
      if (!response.ok) throw new Error('无法获取视频列表');
      const data = await response.json();
      const list = Array.isArray(data.list) ? data.list : [];
      setVideoResults(previous => isLoadMore ? [...previous, ...list] : list);
      setVideoHasMore(Boolean(data.hasMore));
      setVideoPage(page);
      setShowVideos(true);
      setAppState(AppState.PREVIEW);
    } catch (error) {
      console.error(error);
      setError(getErrorMessage(error, '获取视频列表失败，请重试'));
      if (!isLoadMore) setAppState(AppState.IDLE);
    } finally {
      setIsVideoLoading(false);
    }
  }, [setAppState, setError]);

  const fetchPhotoFolders = useCallback(async () => {
    setIsPhotoLoading(true);
    setShowVideos(false);
    try {
      const response = await fetch('/api/list-photo-folders');
      if (!response.ok) throw new Error('无法获取相册文件夹');
      const data = await response.json();
      setPhotoFolders(Array.isArray(data.list) ? data.list : []);
      setShowPhotos(true);
      setSelectedPhotoFolder(null);
      setAppState(AppState.PREVIEW);
    } catch (error) {
      console.error(error);
      setError(getErrorMessage(error, '获取相册列表失败，请重试'));
      setAppState(AppState.IDLE);
    } finally {
      setIsPhotoLoading(false);
    }
  }, [setAppState, setError]);

  const fetchPhotos = useCallback(async (folder: string, page: number, isLoadMore = false) => {
    setIsPhotoLoading(true);
    try {
      const response = await fetch(`/api/list-photos?folder=${encodeURIComponent(folder)}&page=${page}&limit=50`);
      if (!response.ok) throw new Error('无法获取照片列表');
      const data = await response.json();
      const list = Array.isArray(data.list) ? data.list : [];
      setPhotoResults(previous => isLoadMore ? [...previous, ...list] : list);
      setPhotoHasMore(Boolean(data.hasMore));
      setPhotoPage(page);
      setSelectedPhotoFolder(folder);
    } catch (error) {
      console.error(error);
      setError(getErrorMessage(error, '获取照片失败，请重试'));
    } finally {
      setIsPhotoLoading(false);
    }
  }, [setError]);

  const hideMedia = useCallback(() => {
    setShowVideos(false);
    setShowPhotos(false);
  }, []);

  return {
    videoResults,
    showVideos,
    videoPage,
    videoSortOrder,
    videoHasMore,
    isVideoLoading,
    setVideoSortOrder,
    fetchVideos,
    photoFolders,
    selectedPhotoFolder,
    photoResults,
    showPhotos,
    isPhotoLoading,
    photoPage,
    photoHasMore,
    setSelectedPhotoFolder,
    fetchPhotoFolders,
    fetchPhotos,
    hideMedia,
  };
};
