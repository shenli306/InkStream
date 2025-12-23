export interface Chapter {
  number: number;
  title: string;
  url?: string;
  content?: string;
}

export interface Novel {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl?: string;
  tags: string[];
  status: 'Serializing' | 'Completed' | 'Unknown';
  detailUrl: string;
  downloadUrl?: string;
  chapters: Chapter[];
  sourceName?: string;
}

export enum AppState {
  IDLE,
  SEARCHING,
  PREVIEW, // Showing search results/book info
  ANALYZING, // Fetching download link
  DOWNLOADING, // Downloading TXT
  PARSING,     // Splitting TXT into chapters
  PACKING,     // Generating EPUB
  COMPLETE,
  ERROR
}
