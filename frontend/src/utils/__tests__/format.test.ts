import { formatFileSize, formatDate, getFileExtension, getMimeTypeIcon } from '../format';

describe('formatFileSize', () => {
  it('formats bytes correctly', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
    expect(formatFileSize(500)).toBe('500 Bytes');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(1073741824)).toBe('1 GB');
    expect(formatFileSize(1099511627776)).toBe('1 TB');
  });
});

describe('formatDate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats recent dates correctly', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    const oneMinAgo = new Date('2024-01-01T11:59:00Z');
    const oneHourAgo = new Date('2024-01-01T11:00:00Z');
    const oneDayAgo = new Date('2023-12-31T12:00:00Z');
    const oneWeekAgo = new Date('2023-12-25T12:00:00Z');

    expect(formatDate(now.toISOString())).toBe('Just now');
    expect(formatDate(oneMinAgo.toISOString())).toBe('1 min ago');
    expect(formatDate(oneHourAgo.toISOString())).toBe('1 hour ago');
    expect(formatDate(oneDayAgo.toISOString())).toBe('1 day ago');
    expect(formatDate(oneWeekAgo.toISOString())).toBe(oneWeekAgo.toLocaleDateString());
  });

  it('handles plurals correctly', () => {
    const twoMinsAgo = new Date('2024-01-01T11:58:00Z');
    const twoHoursAgo = new Date('2024-01-01T10:00:00Z');
    const twoDaysAgo = new Date('2023-12-30T12:00:00Z');

    expect(formatDate(twoMinsAgo.toISOString())).toBe('2 min ago');
    expect(formatDate(twoHoursAgo.toISOString())).toBe('2 hours ago');
    expect(formatDate(twoDaysAgo.toISOString())).toBe('2 days ago');
  });
});

describe('getFileExtension', () => {
  it('extracts file extensions correctly', () => {
    expect(getFileExtension('document.pdf')).toBe('pdf');
    expect(getFileExtension('image.JPG')).toBe('jpg');
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
    expect(getFileExtension('noextension')).toBe('');
    expect(getFileExtension('.hidden')).toBe('hidden');
  });
});

describe('getMimeTypeIcon', () => {
  it('returns correct icons for MIME types', () => {
    expect(getMimeTypeIcon('image/png')).toBe('🖼️');
    expect(getMimeTypeIcon('image/jpeg')).toBe('🖼️');
    expect(getMimeTypeIcon('video/mp4')).toBe('🎥');
    expect(getMimeTypeIcon('audio/mpeg')).toBe('🎵');
    expect(getMimeTypeIcon('application/pdf')).toBe('📄');
    expect(getMimeTypeIcon('application/msword')).toBe('📝');
    expect(getMimeTypeIcon('application/vnd.ms-excel')).toBe('📊');
    expect(getMimeTypeIcon('application/vnd.ms-powerpoint')).toBe('📑');
    expect(getMimeTypeIcon('application/zip')).toBe('🗜️');
    expect(getMimeTypeIcon('text/plain')).toBe('📃');
    expect(getMimeTypeIcon('application/unknown')).toBe('📎');
  });
});