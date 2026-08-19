/**
 * 对象存储不再内置密钥。
 * 请通过环境变量 FILE_OSS_* 或后台「对象存储」配置。
 * 以下仅作非密钥类的空结构默认值（不会写死 AccessKey）。
 */
export const FILE_OSS_EMPTY: {
  baseUrl: string;
  apiEndpoint: string;
  bucket: string;
  keyPrefix: string;
  accessKeyId: string;
  accessKeySecret: string;
} = {
  baseUrl: '',
  apiEndpoint: '',
  bucket: '',
  keyPrefix: 'media',
  accessKeyId: '',
  accessKeySecret: '',
};
