declare const process: {
  env: Record<string, string | undefined>;
};

type BufferLike = Uint8Array;

declare const Buffer: {
  from(data: string, encoding?: string): BufferLike;
  from(data: string): BufferLike;
  concat(chunks: readonly BufferLike[]): BufferLike;
};
