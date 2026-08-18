import { namiAsset } from './oss-public';

/** 纳米工具箱「发现」官方预览视频（MinIO key：nami/discover/{id}.{jpg|mp4}） */
export const NAMI_DISCOVER_IDS = [
  '0140d0c85c9ec43f92de7286bfe118e7',
  '0W3m4eGjh0wh0EwK4eduwa',
  '15ed484273ec2687ec3bfec2b0082453',
  '2a1d4487f59d42334116e64ca4e7ef91',
  '32d658aebe695902a9cb35ad282918f1fc9eca82',
  '4lkw0hqFUrVhKdmUwTMtb0',
  '68d899943f8157bef12098da4d41101f',
  '94759bdcda3b33483a0ef46f54438e84',
  'ad2c8fece92fe5a6604fad55fbf39c18',
  'bOahCvm04wxiBV0hwvpCU6',
  'c8dd60169f96b53b73c8c732c0c1a93e',
  'e4e178e332a279da1debfe93e26ad75d',
  'fdb6317251332fe8a4298e11a455fcbb',
  'qhiwf40dn8xhwmUuVc0kTT',
  'w0kOrUh0glOZrQ0AI0hhlw',
  'wU55Yxma0hnZT9IP0we7hX',
] as const;

export type NamiDiscoverClip = {
  id: string;
  cover: string;
  video: string;
};

export function namiDiscoverClips(): NamiDiscoverClip[] {
  return NAMI_DISCOVER_IDS.map((id) => ({
    id,
    cover: namiAsset(`discover/${id}.jpg`),
    video: namiAsset(`discover/${id}.mp4`),
  }));
}
