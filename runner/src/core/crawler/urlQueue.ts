import { canonicalKey, getHostKey } from "./urlNormalizer";

export type QueueItem = {
  url: URL;
  depth: number;
};

export type UrlQueueSnapshot = {
  size: number;
  visited: number;
};

export class UrlQueue {
  private readonly maxDepth: number;
  private readonly root: URL;
  private readonly allowSubdomains: boolean;
  private readonly queue: QueueItem[] = [];
  private readonly seen = new Set<string>();

  constructor(args: { root: URL; maxDepth: number; allowSubdomains?: boolean }) {
    this.root = args.root;
    this.maxDepth = args.maxDepth;
    this.allowSubdomains = args.allowSubdomains ?? true;
  }

  enqueue(url: URL, depth: number): boolean {
    if (depth < 0 || depth > this.maxDepth) return false;
    if (!this.isInScope(url)) return false;

    const key = canonicalKey(url);
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.queue.push({ url, depth });
    return true;
  }

  dequeue(): QueueItem | undefined {
    return this.queue.shift();
  }

  snapshot(): UrlQueueSnapshot {
    return { size: this.queue.length, visited: this.seen.size };
  }

  private isInScope(url: URL): boolean {
    if (url.protocol !== this.root.protocol) return false;
    if (url.hostname === this.root.hostname) return true;
    if (!this.allowSubdomains) return false;
    return getHostKey(url).endsWith(`.${this.root.hostname}`);
  }
}

