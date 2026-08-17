import { Injectable } from '@nestjs/common';

/** 设置页改并发时通知任务队列，避免 Settings ↔ Jobs 模块循环依赖 */
@Injectable()
export class JobConcurrencyNotifier {
  private listener: ((n: number) => void) | null = null;

  onChange(fn: (n: number) => void) {
    this.listener = fn;
  }

  notify(n: number) {
    this.listener?.(n);
  }
}
