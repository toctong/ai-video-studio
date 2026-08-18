/**
 * 对象存储写死配置（不再走设置页 / 本地磁盘）。
 * API 写入走内网 MinIO；浏览器读走公网域名。
 */
export const HARDCODED_FILE_OSS = {
  /** S3 API（Put/Head/建桶） */
  apiEndpoint: 'http://100.66.1.5:9000',
  /** 浏览器访问对象的前缀（path-style：{base}/{bucket}/{key}） */
  baseUrl: 'https://minio-aka.iepose.cn',
  bucket: 'ai-video-studio',
  keyPrefix: 'media',
  accessKeyId: 'ZuPUar172PyY8tm7PTiQ',
  accessKeySecret: 'iF6M1MJWJdVi3ajrPFMnKjQH0dqVGy6lSuTIQa6S',
} as const;
